import asyncio

from telethon import TelegramClient
from telethon.sessions import StringSession

from app.db import repo

_client: TelegramClient | None = None
_lock = asyncio.Lock()


def build_login_client(api_id: int, api_hash: str) -> TelegramClient:
    """Свежий клиент с пустой StringSession — для процесса веб-логина."""
    return TelegramClient(StringSession(), api_id, api_hash, flood_sleep_threshold=60)


async def get_client() -> TelegramClient | None:
    """Единый подключённый клиент, собранный из сохранённой в БД (зашифрованной)
    сессии. Возвращает None, если авторизации ещё нет."""
    global _client
    async with _lock:
        if _client is not None and _client.is_connected():
            return _client
        auth = repo.get_auth()
        if auth is None:
            return None
        _client = TelegramClient(
            StringSession(auth["session"]),
            auth["api_id"],
            auth["api_hash"],
            flood_sleep_threshold=120,
        )
        await _client.connect()
        return _client


async def reset_client():
    """Сбросить кэшированный клиент (после логина/логаута) — пересоберётся из БД."""
    global _client
    async with _lock:
        if _client is not None:
            try:
                await _client.disconnect()
            except Exception:  # noqa: BLE001
                pass
            _client = None


async def ensure_authorized() -> bool:
    client = await get_client()
    if client is None:
        return False
    try:
        return await client.is_user_authorized()
    except Exception:  # noqa: BLE001
        return False
