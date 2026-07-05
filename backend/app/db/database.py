import sqlite3
import threading
from pathlib import Path

from app.config import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS channels (
    id              TEXT PRIMARY KEY,      -- id канала (строка)
    access_hash     TEXT NOT NULL,
    title           TEXT,
    username        TEXT,
    photo           BLOB,                  -- аватарка канала (jpeg)
    last_message_id INTEGER DEFAULT 0,     -- курсор инкрементальной индексации
    added_at        INTEGER
);

CREATE TABLE IF NOT EXISTS videos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id  TEXT NOT NULL,
    message_id  INTEGER NOT NULL,
    duration    INTEGER,
    width       INTEGER,
    height      INTEGER,
    size        INTEGER,
    mime        TEXT,
    caption     TEXT,
    file_name   TEXT,
    thumb       BLOB,
    date        INTEGER,
    hidden      INTEGER DEFAULT 0,         -- «не интересует» → не показывать
    -- локатор документа для прямого стриминга без get_messages
    doc_id          TEXT,
    doc_access_hash TEXT,
    file_reference  BLOB,
    doc_dc_id       INTEGER,
    UNIQUE (channel_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id);

CREATE TABLE IF NOT EXISTS photos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id  TEXT NOT NULL,
    message_id  INTEGER NOT NULL,
    post_key    TEXT NOT NULL,            -- grouped_id альбома или m<message_id>
    caption     TEXT,
    date        INTEGER,
    UNIQUE (channel_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_photos_channel ON photos(channel_id);
CREATE INDEX IF NOT EXISTS idx_photos_group ON photos(channel_id, post_key);
"""

# sqlite3 синхронный; FastAPI + Telethon асинхронные. Держим одно соединение
# с check_same_thread=False и сериализуем доступ через Lock. Запросы лёгкие.
_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


# Колонки, которые могли отсутствовать в старых БД (добавляем на лету).
_MIGRATIONS = {
    "videos": {
        "doc_id": "TEXT",
        "doc_access_hash": "TEXT",
        "file_reference": "BLOB",
        "doc_dc_id": "INTEGER",
        "hidden": "INTEGER DEFAULT 0",
    },
    "channels": {
        "photo": "BLOB",
    },
}


def _migrate(conn: sqlite3.Connection):
    for table, cols in _MIGRATIONS.items():
        existing = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
        for name, decl in cols.items():
            if name not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")
    conn.commit()


def get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        Path(config.db_path).parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(config.db_path, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        # два контейнера (API + воркер) пишут/читают одну БД — ждём снятия блокировки
        _conn.execute("PRAGMA busy_timeout=5000")
        _conn.executescript(SCHEMA)
        _conn.commit()
        _migrate(_conn)
    return _conn


class Db:
    """Тонкая потокобезопасная обёртка над одним соединением."""

    def execute(self, sql: str, params=()):
        with _lock:
            cur = get_conn().execute(sql, params)
            get_conn().commit()
            return cur

    def query_all(self, sql: str, params=()):
        with _lock:
            return get_conn().execute(sql, params).fetchall()

    def query_one(self, sql: str, params=()):
        with _lock:
            return get_conn().execute(sql, params).fetchone()


db = Db()
