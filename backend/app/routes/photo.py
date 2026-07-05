from fastapi import APIRouter, Query, Response

from app.db import repo
from app.telegram.photo_streamer import get_photo_bytes

router = APIRouter()


@router.get("/photo/{photo_id}")
async def photo(photo_id: int):
    data = await get_photo_bytes(photo_id)
    if not data:
        return Response(status_code=404)
    return Response(
        content=data,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/api/photos")
async def photos(
    seed: int = Query(1),
    offset: int = 0,
    limit: int = Query(6, ge=1, le=20),
):
    rows, total = repo.get_photo_posts(seed, offset, limit)
    items = [
        {
            "id": r["id"],
            "channel": r["channel"],
            "channelId": r["channel_id"],
            "username": r["username"],
            "caption": r["caption"],
            "channelPhotoUrl": f"/channel/{r['channel_id']}/photo",
            "photos": [f"/photo/{pid}" for pid in r["photo_ids"]],
            "postUrl": (
                f"https://t.me/{r['username']}/{r['id']}" if r["username"] else None
            ),
        }
        for r in rows
    ]
    next_offset = offset + limit if offset + limit < total else None
    return {"items": items, "offset": offset, "limit": limit, "total": total, "next": next_offset}
