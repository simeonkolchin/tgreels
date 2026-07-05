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

    session_path: str = os.getenv("SESSION_PATH", "./data/session/userbot")
    db_path: str = os.getenv("DB_PATH", "./data/videos.db")

    port: int = int(os.getenv("PORT", "8000"))

    index_interval_hours: int = int(os.getenv("INDEX_INTERVAL_HOURS", "12"))
    max_history_per_channel: int = int(os.getenv("MAX_HISTORY_PER_CHANNEL", "0"))
    vertical_only: bool = _bool("VERTICAL_ONLY", True)
    include_groups: bool = _bool("INCLUDE_GROUPS", False)

    # Размер одного запроса к Telegram при стриминге. Кратен 4096, максимум 1 МБ.
    # 1 МБ = меньше round-trip'ов на буферизацию.
    request_size: int = 1024 * 1024


config = Config()

if not config.api_id or not config.api_hash:
    print("[config] API_ID / API_HASH не заданы — заполни .env (см. .env.example)")
