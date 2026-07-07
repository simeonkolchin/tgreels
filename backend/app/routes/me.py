import asyncio
import re
import time

from fastapi import APIRouter, Request, Response
from fastapi.responses import StreamingResponse
from telethon.tl.functions.channels import GetFullChannelRequest
from telethon.tl.functions.users import GetFullUserRequest
from telethon.tl.types import Document, DocumentAttributeVideo, PhotoSize

from app.db import repo
from app.telegram.client import get_client
from app.telegram.streamer import stream_doc

router = APIRouter()

_RANGE_RE = re.compile(r"bytes=(\d+)-(\d*)")

# кэши, чтобы не дёргать Telegram на каждый запрос
_list_cache: dict = {"t": 0.0, "me": None, "photos": None}
_bytes_cache: dict[int, bytes] = {}
_chan_cache: dict = {"t": 0.0, "channel": None}
_gallery_cache: dict = {"t": 0.0, "ids": []}
_g_bytes: dict[int, bytes] = {}
_videos_cache: dict = {"t": 0.0, "items": []}
_vdoc_cache: dict = {}
_vthumb_cache: dict[int, bytes] = {}
_stats_state: dict = {"running": False}
STATS_TTL = 6 * 3600  # пересчитывать статистику не чаще раза в 6 часов


def _pick_size(photo):
    sizes = [s for s in photo.sizes if isinstance(s, PhotoSize)]
    if not sizes:
        return None
    by = {s.type: s for s in sizes}
    for t in ("x", "m", "y"):
        if t in by:
            return by[t]
    return sizes[-1]


async def _personal_channel(client):
    now = time.monotonic()
    if _chan_cache["t"] > now:
        return _chan_cache["channel"]
    channel = None
    try:
        full = await client(GetFullUserRequest("me"))
        pc = getattr(full.full_user, "personal_channel_id", None)
        if pc:
            channel = next((c for c in full.chats if c.id == pc), None)
    except Exception:  # noqa: BLE001
        pass
    _chan_cache.update(t=now + 300, channel=channel)
    return channel


async def _load(client):
    now = time.monotonic()
    if _list_cache["me"] is not None and _list_cache["t"] > now:
        return _list_cache["me"], _list_cache["photos"]
    me = await client.get_me()
    try:
        photos = await client.get_profile_photos("me", limit=12)
    except Exception:  # noqa: BLE001
        photos = []
    _list_cache.update(t=now + 300, me=me, photos=photos)
    return me, photos


async def _gallery_ids(client):
    now = time.monotonic()
    chan = await _personal_channel(client)
    if _gallery_cache["t"] > now:
        return chan, _gallery_cache["ids"]
    ids: list[int] = []
    if chan is not None:
        try:
            async for msg in client.iter_messages(chan, limit=60):
                if msg.photo is not None:
                    ids.append(msg.id)
                    if len(ids) >= 30:
                        break
        except Exception:  # noqa: BLE001
            pass
    _gallery_cache.update(t=now + 300, ids=ids)
    return chan, ids


async def _channel_videos(client):
    now = time.monotonic()
    chan = await _personal_channel(client)
    if _videos_cache["t"] > now:
        return chan, _videos_cache["items"]
    items: list[dict] = []
    if chan is not None:
        try:
            async for msg in client.iter_messages(chan, limit=100):
                doc = getattr(msg, "document", None)
                if not isinstance(doc, Document):
                    continue
                if not (doc.mime_type or "").startswith("video"):
                    continue
                va = next(
                    (a for a in doc.attributes if isinstance(a, DocumentAttributeVideo)),
                    None,
                )
                if va is None:
                    continue
                # горизонтальные тоже берём (фронт повернёт их на 90°)
                items.append(
                    {"id": msg.id, "w": va.w or 0, "h": va.h or 0, "duration": int(va.duration or 0)}
                )
                if len(items) >= 30:
                    break
        except Exception:  # noqa: BLE001
            pass
    _videos_cache.update(t=now + 300, items=items)
    return chan, items


async def _resolve_video(client, msg_id: int):
    now = time.monotonic()
    c = _vdoc_cache.get(msg_id)
    if c and c[0] > now:
        return c[1], c[2], c[3]
    chan = await _personal_channel(client)
    if chan is None:
        return None, 0, ""
    msg = await client.get_messages(chan, ids=msg_id)
    doc = getattr(msg, "document", None) if msg else None
    if not isinstance(doc, Document):
        return None, 0, ""
    _vdoc_cache[msg_id] = (now + 300, doc, doc.size or 0, doc.mime_type or "video/mp4")
    return doc, doc.size or 0, doc.mime_type or "video/mp4"


# ── профиль ─────────────────────────────────────────────────

@router.get("/api/me")
async def me():
    client = await get_client()
    if client is None:
        return {"name": "", "username": None, "photos": 0}
    u, photos = await _load(client)
    name = " ".join(x for x in (u.first_name, u.last_name) if x) or (u.username or "Аккаунт")
    return {"name": name, "username": u.username, "photos": len(photos)}


@router.get("/api/me/photo")
async def me_photo(i: int = 0):
    if i in _bytes_cache:
        return Response(_bytes_cache[i], media_type="image/jpeg", headers={"Cache-Control": "public, max-age=3600"})
    client = await get_client()
    if client is None:
        return Response(status_code=404)
    _u, photos = await _load(client)
    if i < 0 or i >= len(photos):
        return Response(status_code=404)
    try:
        data = await client.download_media(photos[i], file=bytes)
    except Exception:  # noqa: BLE001
        data = None
    if not data:
        return Response(status_code=404)
    _bytes_cache[i] = bytes(data)
    return Response(bytes(data), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=3600"})


# ── раздел «Фото» ───────────────────────────────────────────

@router.get("/api/me/gallery")
async def gallery():
    client = await get_client()
    if client is None:
        return {"channel": False, "photos": []}
    chan, ids = await _gallery_ids(client)
    return {"channel": chan is not None, "photos": ids}


@router.get("/api/me/gphoto")
async def gphoto(id: int):
    if id in _g_bytes:
        return Response(_g_bytes[id], media_type="image/jpeg", headers={"Cache-Control": "public, max-age=3600"})
    client = await get_client()
    if client is None:
        return Response(status_code=404)
    chan, ids = await _gallery_ids(client)
    if chan is None or id not in ids:
        return Response(status_code=404)
    msg = await client.get_messages(chan, ids=id)
    if msg is None or msg.photo is None:
        return Response(status_code=404)
    try:
        data = await client.download_media(msg, file=bytes, thumb=_pick_size(msg.photo))
    except Exception:  # noqa: BLE001
        data = None
    if not data:
        return Response(status_code=404)
    _g_bytes[id] = bytes(data)
    return Response(bytes(data), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=3600"})


# ── раздел «Видео канала» ───────────────────────────────────

@router.get("/api/me/videos")
async def my_videos():
    client = await get_client()
    if client is None:
        return {"channel": False, "items": []}
    chan, items = await _channel_videos(client)
    title = getattr(chan, "title", "") if chan else ""
    out = [
        {
            "id": v["id"],
            "streamUrl": f"/api/me/video?id={v['id']}",
            "thumbUrl": f"/api/me/vthumb?id={v['id']}",
            "width": v["w"],
            "height": v["h"],
            "duration": v["duration"],
            "caption": "",
            "channel": title,
            "channelId": "me",
            "username": None,
            "messageId": v["id"],
            "channelPhotoUrl": "/api/me/photo?i=0",
            "postUrl": None,
        }
        for v in items
    ]
    return {"channel": chan is not None, "items": out}


@router.get("/api/me/vthumb")
async def my_vthumb(id: int):
    if id in _vthumb_cache:
        return Response(_vthumb_cache[id], media_type="image/jpeg", headers={"Cache-Control": "public, max-age=3600"})
    client = await get_client()
    if client is None:
        return Response(status_code=404)
    chan = await _personal_channel(client)
    if chan is None:
        return Response(status_code=404)
    msg = await client.get_messages(chan, ids=id)
    if msg is None:
        return Response(status_code=404)
    try:
        data = await client.download_media(msg, file=bytes, thumb=-1)
    except Exception:  # noqa: BLE001
        data = None
    if not data:
        return Response(status_code=404)
    _vthumb_cache[id] = bytes(data)
    return Response(bytes(data), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=3600"})


@router.api_route("/api/me/video", methods=["GET", "HEAD"])
async def my_video(id: int, request: Request):
    client = await get_client()
    if client is None:
        return Response(status_code=404)
    doc, size, mime = await _resolve_video(client, id)
    if doc is None:
        return Response(status_code=404)

    range_header = request.headers.get("range")
    base = {"Accept-Ranges": "bytes", "Content-Type": mime, "Cache-Control": "no-store"}
    if not range_header:
        headers = {**base, "Content-Length": str(size)}
        if request.method == "HEAD":
            return Response(status_code=200, headers=headers)
        return StreamingResponse(stream_doc(doc, 0, size - 1), status_code=200, headers=headers)

    m = _RANGE_RE.search(range_header)
    if not m:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
    start = int(m.group(1))
    end = int(m.group(2)) if m.group(2) else size - 1
    if end >= size:
        end = size - 1
    if start > end or start >= size:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
    length = end - start + 1
    headers = {**base, "Content-Range": f"bytes {start}-{end}/{size}", "Content-Length": str(length)}
    if request.method == "HEAD":
        return Response(status_code=206, headers=headers)
    return StreamingResponse(stream_doc(doc, start, end), status_code=206, headers=headers)


# ── раздел «Мои лайки» ──────────────────────────────────────

@router.get("/api/me/likes")
async def my_likes():
    from app.routes.feed import video_item

    items = []
    for vid in repo.liked_ids():
        r = repo.get_video(vid)
        if r:
            items.append(video_item(r))
    return {"items": items}


# ── Статистика канала (подписчики / посты / сумма реакций) ──

async def _compute_stats():
    """Считаем метрики по личному каналу и пишем в БД по мере готовности,
    чтобы фронт мог показывать каждую цифру как только она посчиталась."""
    if _stats_state["running"]:
        return
    _stats_state["running"] = True
    try:
        client = await get_client()
        if client is None:
            return
        chan = await _personal_channel(client)
        if chan is None:
            return
        # подписчики
        try:
            full = await client(GetFullChannelRequest(chan))
            repo.set_stat("stat_followers", full.full_chat.participants_count or 0)
        except Exception:  # noqa: BLE001
            pass
        # число постов
        try:
            tot = await client.get_messages(chan, limit=0)
            repo.set_stat("stat_posts", getattr(tot, "total", 0) or 0)
        except Exception:  # noqa: BLE001
            pass
        # сумма реакций (эмодзи) под всеми постами
        try:
            total = 0
            async for msg in client.iter_messages(chan, limit=5000):
                r = getattr(msg, "reactions", None)
                if r and getattr(r, "results", None):
                    for rc in r.results:
                        total += getattr(rc, "count", 0) or 0
            repo.set_stat("stat_likes", total)
        except Exception:  # noqa: BLE001
            pass
        # каналы в подписках и всего чатов (по диалогам)
        try:
            dialogs = await client.get_dialogs(limit=None)
            repo.set_stat("stat_chats", len(dialogs))
            channels = sum(
                1 for d in dialogs if getattr(getattr(d, "entity", None), "broadcast", False)
            )
            repo.set_stat("stat_channels", channels)
        except Exception:  # noqa: BLE001
            pass
        # число сообщений в «Избранном» (Saved Messages = чат с самим собой)
        try:
            saved = await client.get_messages("me", limit=0)
            repo.set_stat("stat_saved", getattr(saved, "total", 0) or 0)
        except Exception:  # noqa: BLE001
            pass
        repo.set_stat("stat_ts", int(time.time()))
    finally:
        _stats_state["running"] = False


@router.get("/api/me/stats")
async def stats(refresh: int = 0):
    data = repo.get_stats()
    fresh = bool(data.get("ts")) and (time.time() - data["ts"] < STATS_TTL)
    if (refresh or not fresh) and not _stats_state["running"]:
        asyncio.create_task(_compute_stats())
    return {
        "posts": data.get("posts"),
        "followers": data.get("followers"),
        "likes": data.get("likes"),
        "channels": data.get("channels"),
        "chats": data.get("chats"),
        "saved": data.get("saved"),
        "computing": _stats_state["running"] or not fresh,
    }
