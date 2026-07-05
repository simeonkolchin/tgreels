import asyncio
from collections import OrderedDict

from telethon.tl.types import PeerChannel, PhotoSize

from app.db import repo
from app.telegram.client import get_client

# Кэш байтов картинок в ПАМЯТИ (не на диске) — «Telegram как хостинг».
# Ограничиваем суммарный объём, вытесняем самые старые (LRU).
_cache: "OrderedDict[int, bytes]" = OrderedDict()
_cache_bytes = 0
_CACHE_LIMIT = 64 * 1024 * 1024  # 64 МБ
_lock = asyncio.Lock()


async def _channel_input(client, channel_id: str):
    peer = PeerChannel(int(channel_id))
    try:
        return await client.get_input_entity(peer)
    except (ValueError, TypeError):
        await client.get_dialogs()
        return await client.get_input_entity(peer)


def _pick_size(photo):
    """Выбрать разумный размер: 'x' (~800px), иначе крупнейший доступный."""
    sizes = [s for s in photo.sizes if isinstance(s, PhotoSize)]
    if not sizes:
        return None
    by_type = {s.type: s for s in sizes}
    for t in ("x", "y", "w", "m"):
        if t in by_type:
            return by_type[t]
    return sizes[-1]


def _cache_put(photo_id: int, data: bytes):
    global _cache_bytes
    _cache[photo_id] = data
    _cache_bytes += len(data)
    while _cache_bytes > _CACHE_LIMIT and _cache:
        _, old = _cache.popitem(last=False)
        _cache_bytes -= len(old)


async def get_photo_bytes(photo_id: int) -> bytes | None:
    async with _lock:
        if photo_id in _cache:
            _cache.move_to_end(photo_id)
            return _cache[photo_id]

    row = repo.get_photo(photo_id)
    if row is None:
        return None

    client = await get_client()
    peer = await _channel_input(client, row["channel_id"])
    msg = await client.get_messages(peer, ids=row["message_id"])
    if msg is None or msg.photo is None:
        return None

    size = _pick_size(msg.photo)
    try:
        data = await client.download_media(msg, file=bytes, thumb=size)
    except Exception:
        data = await client.download_media(msg, file=bytes)
    if not data:
        return None

    async with _lock:
        _cache_put(photo_id, bytes(data))
    return bytes(data)
