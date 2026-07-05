import re

from fastapi import APIRouter, Request, Response
from fastapi.responses import StreamingResponse

from app.telegram.streamer import resolve_doc, stream_range

router = APIRouter()

_RANGE_RE = re.compile(r"bytes=(\d+)-(\d*)")


@router.api_route("/stream/{video_id}", methods=["GET", "HEAD"])
async def stream(video_id: int, request: Request):
    info = await resolve_doc(video_id)
    if info is None:
        return Response(status_code=404)

    size = info.size
    range_header = request.headers.get("range")

    base_headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": info.mime,
        # содержимое ролика неизменно → разрешаем кэш (перемотка/возврат без пере-качки)
        "Cache-Control": "public, max-age=86400",
    }

    # Без Range — отдаём весь файл (или только заголовки на HEAD).
    if not range_header:
        headers = {**base_headers, "Content-Length": str(size)}
        if request.method == "HEAD":
            return Response(status_code=200, headers=headers)
        return StreamingResponse(
            stream_range(video_id, info, 0, size - 1),
            status_code=200,
            headers=headers,
        )

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
    headers = {
        **base_headers,
        "Content-Range": f"bytes {start}-{end}/{size}",
        "Content-Length": str(length),
    }
    if request.method == "HEAD":
        return Response(status_code=206, headers=headers)

    return StreamingResponse(
        stream_range(video_id, info, start, end),
        status_code=206,
        headers=headers,
    )
