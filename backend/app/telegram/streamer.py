import asyncio
import time
from dataclasses import dataclass

from telethon.errors import FileReferenceExpiredError
from telethon.tl.types import Document, PeerChannel

from app.config import config
from app.db import repo
from app.telegram.client import get_client


@dataclass
class ResolvedDoc:
    doc: Document
    size: int
    mime: str


# ВАЖНО: access_hash каналов и file_reference документов привязаны к СЕССИИ.
# Локатор, записанный воркером (его сессия), не годится для стрим-сессии backend.
# Поэтому backend резолвит канал сам (по стабильному channel_id) и берёт свежий
# документ своей сессией. Результат держим в памяти короткое время — плеер шлёт
# много Range-запросов на один ролик.
_cache: dict[int, tuple[float, ResolvedDoc]] = {}
_lock = asyncio.Lock()
CACHE_TTL = 300.0


async def _channel_input(client, channel_id: str):
    """InputPeer канала через СВОЮ сессию (свой access_hash из entity-кэша).
    Если канал ещё не в кэше (воркер добавил новый) — прогреваем диалоги."""
    peer = PeerChannel(int(channel_id))
    try:
        return await client.get_input_entity(peer)
    except (ValueError, TypeError):
        await client.get_dialogs()
        return await client.get_input_entity(peer)


async def _resolve_uncached(video_id: int) -> ResolvedDoc | None:
    row = repo.get_video(video_id)
    if row is None:
        return None
    client = await get_client()
    if client is None:
        return None
    peer = await _channel_input(client, row["channel_id"])
    msg = await client.get_messages(peer, ids=row["message_id"])
    doc = getattr(msg, "document", None) if msg else None
    if not isinstance(doc, Document):
        return None
    return ResolvedDoc(doc=doc, size=doc.size or 0, mime=doc.mime_type or "video/mp4")


async def resolve_doc(video_id: int, force: bool = False) -> ResolvedDoc | None:
    now = time.monotonic()
    if not force:
        async with _lock:
            cached = _cache.get(video_id)
            if cached and cached[0] > now:
                return cached[1]

    resolved = await _resolve_uncached(video_id)
    if resolved is None:
        return None
    async with _lock:
        _cache[video_id] = (now + CACHE_TTL, resolved)
    return resolved


async def _download(doc: Document, start: int, end: int):
    """Отдать байты [start, end] включительно из Telegram кусками.

    Offset выравниваем вниз до 4096 (требование Telegram), лишнее в первом
    чанке отрезаем. request_size (1 МБ) кратен 4096. dc/размер берутся из doc.
    """
    client = await get_client()
    if client is None:
        return
    aligned = (start // 4096) * 4096
    skip = start - aligned
    remaining = end - start + 1

    async for chunk in client.iter_download(
        doc, offset=aligned, request_size=config.request_size
    ):
        if not chunk:
            break
        if skip:
            if skip >= len(chunk):
                skip -= len(chunk)
                continue
            chunk = chunk[skip:]
            skip = 0
        if len(chunk) > remaining:
            chunk = chunk[:remaining]
        remaining -= len(chunk)
        # Telethon отдаёт memoryview — Starlette принимает только bytes
        yield bytes(chunk)
        if remaining <= 0:
            break


async def stream_doc(doc: Document, start: int, end: int):
    """Стрим произвольного документа (например, видео личного канала),
    которого нет в БД. Ре-резолва нет — рассчитано на свежий (кэш ≤5 мин) doc."""
    async for chunk in _download(doc, start, end):
        yield chunk


async def stream_range(video_id: int, info: ResolvedDoc, start: int, end: int):
    """Стрим с одной попыткой ре-резолва, если file_reference протух.

    Протухание проявляется на первом getFile, до отдачи байтов, — поэтому
    ретраим только если ещё ничего не выслали."""
    yielded = False
    try:
        async for chunk in _download(info.doc, start, end):
            yielded = True
            yield chunk
    except FileReferenceExpiredError:
        if yielded:
            return
        fresh = await resolve_doc(video_id, force=True)
        if fresh is None:
            return
        async for chunk in _download(fresh.doc, start, end):
            yield chunk
