import asyncio
from urllib.parse import urlparse

from telethon import TelegramClient
from telethon.sessions import StringSession

from app.config import config
from app.db import repo

_client: TelegramClient | None = None
_lock = asyncio.Lock()


def _proxy():
    """Парсит config.tg_proxy в формат прокси Telethon (python_socks).
    Пусто → None (прямое подключение)."""
    raw = (config.tg_proxy or "").strip()
    if not raw:
        return None
    u = urlparse(raw if "://" in raw else "http://" + raw)
    scheme = (u.scheme or "http").lower()
    ptype = {"https": "http", "socks5h": "socks5", "socks4a": "socks4"}.get(scheme, scheme)
    if ptype not in ("http", "socks5", "socks4"):
        ptype = "http"
    d = {
        "proxy_type": ptype,
        "addr": u.hostname,
        "port": u.port or (1080 if ptype.startswith("socks") else 8080),
        "rdns": True,
    }
    if u.username:
        d["username"] = u.username
        d["password"] = u.password or ""
    return d


def build_login_client(api_id: int, api_hash: str) -> TelegramClient:
    """Свежий клиент с пустой StringSession — для процесса веб-логина."""
    return TelegramClient(
        StringSession(), api_id, api_hash, flood_sleep_threshold=60, proxy=_proxy()
    )


def build_client_with_session(api_id: int, api_hash: str, session: str) -> TelegramClient:
    """Отдельный клиент из готовой сессии (для отправки кода входа в Избранное)."""
    return TelegramClient(
        StringSession(session), api_id, api_hash, flood_sleep_threshold=60, proxy=_proxy()
    )


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
            proxy=_proxy(),
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
