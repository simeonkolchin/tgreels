import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _bool(name: str, default: bool) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Config:
    api_id: int = int(os.getenv("API_ID", "0"))
    api_hash: str = os.getenv("API_HASH", "")
    # StringSession для тест-режима (99019) — чтобы не переавторизовываться
    tg_session: str = os.getenv("TG_SESSION", "")
    # Прокси для Telethon (обход блокировок Telegram). Формат:
    # http://host:port, socks5://user:pass@host:port. Пусто = напрямую.
    tg_proxy: str = os.getenv("TG_PROXY", "")

    session_path: str = os.getenv("SESSION_PATH", "./data/session/userbot")
    db_path: str = os.getenv("DB_PATH", "./data/videos.db")
    # ключ шифрования сессии (генерируется автоматически при первом старте)
    secret_key_file: str = os.getenv("SECRET_KEY_FILE", "./data/secret.key")

    port: int = int(os.getenv("PORT", "8000"))

    index_interval_hours: int = int(os.getenv("INDEX_INTERVAL_HOURS", "12"))
    max_history_per_channel: int = int(os.getenv("MAX_HISTORY_PER_CHANNEL", "0"))
    vertical_only: bool = _bool("VERTICAL_ONLY", True)
    include_groups: bool = _bool("INCLUDE_GROUPS", False)

    # Размер одного запроса к Telegram при стриминге. Кратен 4096, максимум 1 МБ.
    # 1 МБ = меньше round-trip'ов на буферизацию.
    request_size: int = 1024 * 1024


config = Config()

# API_ID/API_HASH теперь вводятся через страницу авторизации и хранятся
# зашифрованными в БД — .env для них больше не обязателен.
