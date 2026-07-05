import os
from pathlib import Path

from telethon import TelegramClient

from app.config import config

_client: TelegramClient | None = None


def build_client() -> TelegramClient:
    """Создать (не подключая) Telethon-клиент с файловой сессией."""
    Path(config.session_path).parent.mkdir(parents=True, exist_ok=True)
    return TelegramClient(
        config.session_path,
        config.api_id,
        config.api_hash,
        # Если Telegram просит подождать N сек (FLOOD_WAIT) и N <= порога —
        # Telethon сам поспит и повторит. Спасает индексатор от падений.
        flood_sleep_threshold=120,
    )


async def get_client() -> TelegramClient:
    """Единый подключённый клиент на весь процесс."""
    global _client
    if _client is not None and _client.is_connected():
        return _client
    if _client is None:
        _client = build_client()
    if not _client.is_connected():
        await _client.connect()
    return _client


async def ensure_authorized() -> bool:
    client = await get_client()
    return await client.is_user_authorized()
