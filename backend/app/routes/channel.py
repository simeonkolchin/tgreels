import time

from fastapi import APIRouter, Response
from telethon.tl.functions.channels import GetFullChannelRequest
from telethon.tl.types import InputChannel

from app.db import repo
from app.telegram.client import get_client

router = APIRouter()

# кэш числа подписчиков (1 запрос к Telegram на канал, обновляем раз в 10 мин)
_subs_cache: dict = {}


@router.get("/channel/{channel_id}/photo")
async def channel_photo(channel_id: str):
    data = repo.get_channel_photo(channel_id)
    if not data:
        return Response(status_code=404)
    return Response(
        content=bytes(data),
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


async def _subscribers(channel_id: str, access_hash) -> int | None:
    now = time.monotonic()
    c = _subs_cache.get(channel_id)
    if c and c[0] > now:
        return c[1]
    subs = None
    try:
        client = await get_client()
        if client is not None and access_hash is not None:
            full = await client(
                GetFullChannelRequest(InputChannel(int(channel_id), int(access_hash)))
            )
            subs = full.full_chat.participants_count
    except Exception:  # noqa: BLE001
        pass
    _subs_cache[channel_id] = (now + 600, subs)
    return subs


@router.get("/api/channel/{channel_id}")
async def channel_info(channel_id: str):
    ch = repo.get_channel(channel_id)
    if ch is None:
        return Response(status_code=404)
    subs = await _subscribers(channel_id, ch["access_hash"])
    return {
        "id": channel_id,
        "name": ch["title"],
        "username": ch["username"],
        "photoUrl": f"/channel/{channel_id}/photo",
        "stats": {
            "subscribers": subs,
            "videos": repo.count_channel_videos(channel_id),
            "photos": repo.count_channel_photos(channel_id),
        },
    }


@router.get("/api/channel/{channel_id}/videos")
async def channel_videos(channel_id: str):
    from app.routes.feed import video_item

    rows = repo.channel_video_rows(channel_id)
    return {"items": [video_item(r) for r in rows]}


@router.get("/api/channel/{channel_id}/photos")
async def channel_photos(channel_id: str):
    ids = repo.channel_photo_ids(channel_id)
    return {"photos": [f"/photo/{pid}" for pid in ids]}
