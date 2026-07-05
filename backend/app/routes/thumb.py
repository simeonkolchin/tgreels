from fastapi import APIRouter, Response

from app.db import repo

router = APIRouter()


@router.get("/thumb/{video_id}")
async def thumb(video_id: int):
    data = repo.get_thumb(video_id)
    if not data:
        return Response(status_code=404)
    return Response(
        content=bytes(data),
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )
