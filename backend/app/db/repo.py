import time

from app.db.database import db

# ── Каналы ──────────────────────────────────────────────────

def upsert_channel(id_, access_hash, title, username):
    db.execute(
        """
        INSERT INTO channels (id, access_hash, title, username, added_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            access_hash = excluded.access_hash,
            title       = excluded.title,
            username    = excluded.username
        """,
        (str(id_), str(access_hash), title, username, int(time.time())),
    )


def set_channel_photo(id_, photo):
    db.execute("UPDATE channels SET photo = ? WHERE id = ?", (photo, str(id_)))


def get_channel_photo(id_):
    row = db.query_one("SELECT photo FROM channels WHERE id = ?", (str(id_),))
    return row["photo"] if row else None


def get_channels():
    return db.query_all("SELECT * FROM channels ORDER BY added_at ASC")


def update_channel_last_id(channel_id, last_id):
    db.execute(
        "UPDATE channels SET last_message_id = ? WHERE id = ?",
        (last_id, str(channel_id)),
    )


def prune_channels(keep_ids) -> int:
    """Удалить каналы, которых нет в keep_ids (отписки), вместе с их видео.
    Возвращает число удалённых каналов."""
    keep = [str(x) for x in keep_ids]
    if keep:
        placeholders = ",".join("?" for _ in keep)
        db.execute(
            f"DELETE FROM videos WHERE channel_id NOT IN ({placeholders})", tuple(keep)
        )
        db.execute(
            f"DELETE FROM photos WHERE channel_id NOT IN ({placeholders})", tuple(keep)
        )
        cur = db.execute(
            f"DELETE FROM channels WHERE id NOT IN ({placeholders})", tuple(keep)
        )
    else:
        # подписок вообще не осталось → чистим всё
        db.execute("DELETE FROM videos")
        db.execute("DELETE FROM photos")
        cur = db.execute("DELETE FROM channels")
    return cur.rowcount


def reset_cursors():
    """Сбросить курсоры каналов → следующий проход перечитает всю историю
    (нужно, чтобы задним числом подхватить фото/новые поля). Данные не удаляются."""
    db.execute("UPDATE channels SET last_message_id = 0")


# ── Настройки / авторизация (шифрованная сессия) ────────────

def set_setting(key: str, value: str):
    db.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def get_setting(key: str):
    row = db.query_one("SELECT value FROM settings WHERE key = ?", (key,))
    return row["value"] if row else None


def save_auth(api_id, api_hash: str, session: str, phone: str | None = None):
    from app.crypto import encrypt

    set_setting("api_id", encrypt(str(api_id)))
    set_setting("api_hash", encrypt(api_hash))
    set_setting("session", encrypt(session))
    if phone:
        set_setting("phone", encrypt(phone))


def get_auth():
    from app.crypto import decrypt

    ai = get_setting("api_id")
    ah = get_setting("api_hash")
    se = get_setting("session")
    if not (ai and ah and se):
        return None
    try:
        return {
            "api_id": int(decrypt(ai)),
            "api_hash": decrypt(ah),
            "session": decrypt(se),
        }
    except Exception:  # noqa: BLE001 — битый ключ/данные
        return None


def clear_auth():
    for k in ("api_id", "api_hash", "session", "phone"):
        db.execute("DELETE FROM settings WHERE key = ?", (k,))


# ── Пользователи (логин/пароль поверх Telegram-сессии) ──────

def username_exists(username: str) -> bool:
    return db.query_one("SELECT 1 FROM users WHERE username = ?", (username,)) is not None


def get_user_by_username(username: str):
    return db.query_one("SELECT * FROM users WHERE username = ?", (username,))


def get_user_by_id(uid: int):
    return db.query_one("SELECT * FROM users WHERE id = ?", (uid,))


def create_user(username, password_hash, api_id, api_hash, session, tg_username):
    from app.crypto import encrypt

    db.execute(
        """
        INSERT INTO users (username, password_hash, api_id, api_hash, session, tg_username, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            username,
            password_hash,
            encrypt(str(api_id)),
            encrypt(api_hash),
            encrypt(session),
            tg_username,
            int(time.time()),
        ),
    )


def get_user_auth(user) -> dict:
    """Расшифрованные Telegram-креды пользователя."""
    from app.crypto import decrypt

    return {
        "api_id": int(decrypt(user["api_id"])),
        "api_hash": decrypt(user["api_hash"]),
        "session": decrypt(user["session"]),
    }


# ── Видео ───────────────────────────────────────────────────

def insert_video(v: dict) -> bool:
    cur = db.execute(
        """
        INSERT OR IGNORE INTO videos
            (channel_id, message_id, duration, width, height, size, mime,
             caption, file_name, thumb, date,
             doc_id, doc_access_hash, file_reference, doc_dc_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(v["channel_id"]),
            v["message_id"],
            v.get("duration", 0),
            v.get("width", 0),
            v.get("height", 0),
            v.get("size", 0),
            v.get("mime", "video/mp4"),
            v.get("caption", ""),
            v.get("file_name"),
            v.get("thumb"),
            v.get("date", 0),
            str(v["doc_id"]) if v.get("doc_id") is not None else None,
            str(v["doc_access_hash"]) if v.get("doc_access_hash") is not None else None,
            v.get("file_reference"),
            v.get("doc_dc_id"),
        ),
    )
    return cur.rowcount > 0


def update_doc_locator(video_id: int, doc_id, access_hash, file_reference, dc_id):
    """Обновить локатор после ре-резолва (например, при протухшем file_reference)."""
    db.execute(
        """
        UPDATE videos
        SET doc_id = ?, doc_access_hash = ?, file_reference = ?, doc_dc_id = ?
        WHERE id = ?
        """,
        (str(doc_id), str(access_hash), file_reference, dc_id, video_id),
    )


def count_videos() -> int:
    return db.query_one("SELECT COUNT(*) AS n FROM videos")["n"]


_VIDEO_JOIN = """
    SELECT v.id, v.channel_id, v.message_id, v.duration, v.width, v.height,
           v.size, v.mime, v.caption, v.file_name, v.date,
           v.doc_id, v.doc_access_hash, v.file_reference, v.doc_dc_id,
           c.access_hash AS access_hash, c.title AS channel_title,
           c.username AS username
    FROM videos v JOIN channels c ON c.id = v.channel_id
"""


def get_video(video_id: int):
    return db.query_one(f"{_VIDEO_JOIN} WHERE v.id = ?", (video_id,))


def hide_video(video_id: int):
    """Пометить видео как «не интересует» — больше не показывать в ленте."""
    db.execute("UPDATE videos SET hidden = 1 WHERE id = ?", (video_id,))


# ── Лайки ───────────────────────────────────────────────────

def set_like(video_id: int, liked: bool):
    if liked:
        db.execute(
            "INSERT OR IGNORE INTO likes (video_id, added_at) VALUES (?, ?)",
            (video_id, int(time.time())),
        )
    else:
        db.execute("DELETE FROM likes WHERE video_id = ?", (video_id,))


def is_liked(video_id: int) -> bool:
    return db.query_one("SELECT 1 FROM likes WHERE video_id = ?", (video_id,)) is not None


def liked_ids() -> list[int]:
    rows = db.query_all("SELECT video_id FROM likes ORDER BY added_at DESC")
    return [r["video_id"] for r in rows]


# ── Статистика канала пользователя (кэш в settings) ─────────

def set_stat(key: str, value: int):
    set_setting(key, str(int(value)))


def get_stats() -> dict:
    def gi(k):
        v = get_setting(k)
        return int(v) if v is not None else None

    return {
        "posts": gi("stat_posts"),
        "followers": gi("stat_followers"),
        "likes": gi("stat_likes"),
        "channels": gi("stat_channels"),
        "chats": gi("stat_chats"),
        "saved": gi("stat_saved"),
        "ts": gi("stat_ts"),
    }


def get_thumb(video_id: int):
    row = db.query_one("SELECT thumb FROM videos WHERE id = ?", (video_id,))
    return row["thumb"] if row else None


def get_videos_by_ids(ids: list[int]):
    if not ids:
        return []
    placeholders = ",".join("?" for _ in ids)
    # скрытые («не интересует») не отдаём
    rows = db.query_all(
        f"{_VIDEO_JOIN} WHERE v.hidden = 0 AND v.id IN ({placeholders})", tuple(ids)
    )
    by_id = {r["id"]: r for r in rows}
    return [by_id[i] for i in ids if i in by_id]


# ── Лента: детерминированный сид-шафл ───────────────────────
# Кэш порядка инвалидируется по СИГНАТУРЕ из БД (count, max_id), а не по
# in-process счётчику — иначе API-процесс не увидит вставки воркера, который
# пишет в БД из отдельного контейнера.
_order_cache: dict[int, tuple[tuple[int, int], list[int]]] = {}  # seed -> (sig, ids)


def _feed_signature() -> tuple[int, int]:
    row = db.query_one("SELECT COUNT(*) AS n, COALESCE(MAX(id), 0) AS m FROM videos")
    return (row["n"], row["m"])


def _mulberry32(seed: int):
    """Маленький детерминированный PRNG (порт mulberry32)."""
    a = seed & 0xFFFFFFFF
    mask = 0xFFFFFFFF

    def rnd():
        nonlocal a
        a = (a + 0x6D2B79F5) & mask
        t = a
        t = ((t ^ (t >> 15)) * (t | 1)) & mask
        t ^= (t + ((t ^ (t >> 7)) * (t | 61) & mask)) & mask
        t &= mask
        return ((t ^ (t >> 14)) & mask) / 4294967296

    return rnd


def _seeded_shuffle(ids: list[int], seed: int) -> list[int]:
    rnd = _mulberry32(seed)
    arr = ids[:]
    for i in range(len(arr) - 1, 0, -1):
        j = int(rnd() * (i + 1))
        arr[i], arr[j] = arr[j], arr[i]
    return arr


def _ordered_ids(seed: int) -> list[int]:
    sig = _feed_signature()
    cached = _order_cache.get(seed)
    if cached and cached[0] == sig:
        return cached[1]
    ids = [r["id"] for r in db.query_all("SELECT id FROM videos")]
    ordered = _seeded_shuffle(ids, seed)
    _order_cache[seed] = (sig, ordered)
    return ordered


def get_feed_page(seed: int, offset: int, limit: int):
    ordered = _ordered_ids(seed)
    page_ids = ordered[offset : offset + limit]
    return get_videos_by_ids(page_ids), len(ordered)


def refresh_feed_cache():
    """Локальный сброс кэша (в процессе воркера — необязателен, API инвалидирует
    по сигнатуре БД сам)."""
    global _order_cache, _photo_order_cache
    _order_cache = {}
    _photo_order_cache = {}


# ── Фото-посты (главная лента) ──────────────────────────────

def insert_photo(p: dict) -> bool:
    cur = db.execute(
        """
        INSERT OR IGNORE INTO photos (channel_id, message_id, post_key, caption, date)
        VALUES (?, ?, ?, ?, ?)
        """,
        (str(p["channel_id"]), p["message_id"], p["post_key"], p.get("caption", ""), p.get("date", 0)),
    )
    return cur.rowcount > 0


def count_photos() -> int:
    return db.query_one("SELECT COUNT(*) AS n FROM photos")["n"]


def get_photo(photo_id: int):
    return db.query_one(
        "SELECT id, channel_id, message_id FROM photos WHERE id = ?", (photo_id,)
    )


_photo_order_cache: dict[int, tuple[tuple[int, int], list[int]]] = {}


def _photo_signature() -> tuple[int, int]:
    row = db.query_one("SELECT COUNT(*) AS n, COALESCE(MAX(id), 0) AS m FROM photos")
    return (row["n"], row["m"])


def _photo_post_ids() -> list[int]:
    # один представитель на пост (альбом): минимальный id в группе
    rows = db.query_all(
        "SELECT MIN(id) AS id FROM photos GROUP BY channel_id, post_key"
    )
    return [r["id"] for r in rows]


def _photo_ordered_ids(seed: int) -> list[int]:
    sig = _photo_signature()
    cached = _photo_order_cache.get(seed)
    if cached and cached[0] == sig:
        return cached[1]
    ordered = _seeded_shuffle(_photo_post_ids(), seed)
    _photo_order_cache[seed] = (sig, ordered)
    return ordered


def get_photo_posts(seed: int, offset: int, limit: int):
    ordered = _photo_ordered_ids(seed)
    reps = ordered[offset : offset + limit]
    posts = []
    for rid in reps:
        rep = db.query_one(
            "SELECT channel_id, post_key FROM photos WHERE id = ?", (rid,)
        )
        if not rep:
            continue
        cid, pk = rep["channel_id"], rep["post_key"]
        photos = db.query_all(
            "SELECT id FROM photos WHERE channel_id = ? AND post_key = ? ORDER BY message_id LIMIT 5",
            (cid, pk),
        )
        cap = db.query_one(
            "SELECT caption FROM photos WHERE channel_id = ? AND post_key = ? AND caption <> '' ORDER BY message_id LIMIT 1",
            (cid, pk),
        )
        ch = db.query_one("SELECT title, username FROM channels WHERE id = ?", (cid,))
        posts.append(
            {
                "id": rid,
                "channel_id": cid,
                "channel": ch["title"] if ch else "",
                "username": ch["username"] if ch else None,
                "caption": cap["caption"] if cap else "",
                "photo_ids": [p["id"] for p in photos],
            }
        )
    return posts, len(ordered)
