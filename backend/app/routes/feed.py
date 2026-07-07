from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.db import repo

router = APIRouter()


def video_item(r) -> dict:
    """Единый формат элемента ленты (переиспользуется для лайков)."""
    return {
        "id": r["id"],
        "streamUrl": f"/stream/{r['id']}",
        "thumbUrl": f"/thumb/{r['id']}",
        "width": r["width"],
        "height": r["height"],
        "duration": r["duration"],
        "caption": r["caption"],
        "channel": r["channel_title"],
        "channelId": r["channel_id"],
        "username": r["username"],
        "messageId": r["message_id"],
        "channelPhotoUrl": f"/channel/{r['channel_id']}/photo",
        "postUrl": (
            f"https://t.me/{r['username']}/{r['message_id']}" if r["username"] else None
        ),
    }


@router.get("/api/feed")
async def feed(
    seed: int = Query(1, description="Сид перемешивания (фронт генерит один раз)"),
    offset: int = 0,
    limit: int = Query(10, ge=1, le=30),
):
    rows, total = repo.get_feed_page(seed, offset, limit)
    items = [video_item(r) for r in rows]
    next_offset = offset + limit if offset + limit < total else None
    return {"items": items, "offset": offset, "limit": limit, "total": total, "next": next_offset}


@router.post("/api/hide/{video_id}")
async def hide(video_id: int):
    repo.hide_video(video_id)
    return {"ok": True}


class LikeBody(BaseModel):
    liked: bool


@router.post("/api/like/{video_id}")
async def like(video_id: int, body: LikeBody):
    repo.set_like(video_id, body.liked)
    return {"ok": True, "liked": body.liked}


@router.post("/api/reindex")
async def reindex():
    # прогоняем индексацию своей (стрим) сессией и возвращаем итоги
    from app.parser.indexer import index_all

    added = await index_all()
    return {"added": added, "videos": repo.count_videos(), "photos": repo.count_photos()}


@router.get("/api/stats")
async def stats():
    return {"videos": repo.count_videos(), "channels": len(repo.get_channels())}
