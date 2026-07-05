from fastapi import APIRouter, Response

from app.db import repo

router = APIRouter()


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
