import asyncio

from telethon.tl.types import PhotoStrippedSize

from app.config import config
from app.db import repo
from app.telegram.client import get_client
from app.telegram.media import (
    channel_peer,
    file_name_of,
    is_wanted_channel,
    message_video_doc,
    video_attr,
)

# Один проход индексации не должен пересекаться сам с собой (крон + ручной запуск).
_lock = asyncio.Lock()


async def sync_channels(client) -> int:
    """Обновить список каналов из диалогов пользователя. Каналы, на которые
    больше нет подписки, удаляются из БД вместе со всеми их видео."""
    found = 0
    keep_ids = []
    async for dialog in client.iter_dialogs():
        entity = dialog.entity
        if not is_wanted_channel(entity, config.include_groups):
            continue
        keep_ids.append(str(entity.id))
        repo.upsert_channel(
            entity.id,
            entity.access_hash,
            entity.title,
            getattr(entity, "username", None),
        )
        # аватарку тянем один раз (если ещё не сохранена)
        if repo.get_channel_photo(entity.id) is None:
            try:
                photo = await client.download_profile_photo(
                    entity, file=bytes, download_big=False
                )
                if photo:
                    repo.set_channel_photo(entity.id, photo)
            except Exception:
                pass
        found += 1

    # вычистить отписки (каналы, которых больше нет в подписках) + их видео
    removed = repo.prune_channels(keep_ids)
    if removed:
        print(f"[index] удалено отписанных каналов: {removed} (вместе с их видео)")
    return found


def _bar(pct: int, width: int = 22) -> str:
    filled = max(0, min(width, int(width * pct / 100)))
    return "[" + "#" * filled + "-" * (width - filled) + "]"


def _stripped_thumb(doc):
    """Встроенный (inline) эскиз без обращения в сеть — быстро для больших объёмов."""
    for t in doc.thumbs or []:
        if isinstance(t, PhotoStrippedSize):
            return t
    return None


async def index_channel(client, channel) -> int:
    """Первый проход — история (с учётом лимита), далее — только новое (min_id).
    Пишет прогресс-бар в лог."""
    peer = channel_peer(channel)
    last_id = channel["last_message_id"] or 0
    title = channel["title"] or channel["id"]

    kwargs = {}
    if last_id > 0:
        kwargs["min_id"] = last_id
    elif config.max_history_per_channel > 0:
        kwargs["limit"] = config.max_history_per_channel

    max_seen = last_id
    vcount = 0
    pcount = 0
    processed = 0
    last_pct = -5

    it = client.iter_messages(peer, **kwargs)
    async for msg in it:
        processed += 1
        if msg.id > max_seen:
            max_seen = msg.id

        # прогресс-бар (total появляется после первого чанка)
        total = getattr(it, "total", 0) or 0
        if total:
            pct = processed * 100 // total
            if pct >= last_pct + 5:
                print(
                    f"[index] {title}: {_bar(pct)} {pct}% ({processed}/{total})  видео+{vcount} фото+{pcount}",
                    flush=True,
                )
                last_pct = pct

        # фото (для главной ленты): альбомы группируем по grouped_id
        if msg.photo is not None:
            post_key = str(msg.grouped_id) if msg.grouped_id else f"m{msg.id}"
            if repo.insert_photo(
                {
                    "channel_id": channel["id"],
                    "message_id": msg.id,
                    "post_key": post_key,
                    "caption": msg.message or "",
                    "date": int(msg.date.timestamp()) if msg.date else 0,
                }
            ):
                pcount += 1
            continue

        doc = message_video_doc(msg)
        if doc is None:
            continue

        v = video_attr(doc)
        if config.vertical_only and v.h and v.w and v.h < v.w:
            continue

        # эскиз берём из inline stripped-превью (без сети) — иначе 20к скачиваний
        thumb = None
        stripped = _stripped_thumb(doc)
        if stripped is not None:
            try:
                thumb = await client.download_media(msg, file=bytes, thumb=stripped)
            except Exception:
                thumb = None

        inserted = repo.insert_video(
            {
                "channel_id": channel["id"],
                "message_id": msg.id,
                "duration": int(v.duration or 0),
                "width": v.w or 0,
                "height": v.h or 0,
                "size": doc.size or 0,
                "mime": doc.mime_type,
                "caption": msg.message or "",
                "file_name": file_name_of(doc),
                "thumb": thumb,
                "date": int(msg.date.timestamp()) if msg.date else 0,
                # локатор для прямого стриминга без get_messages
                "doc_id": doc.id,
                "doc_access_hash": doc.access_hash,
                "file_reference": bytes(doc.file_reference) if doc.file_reference else None,
                "doc_dc_id": doc.dc_id,
            }
        )
        if inserted:
            vcount += 1

    if max_seen > last_id:
        repo.update_channel_last_id(channel["id"], max_seen)
    print(f"[index] {title}: ✓ видео +{vcount}, фото +{pcount} (просмотрено {processed})", flush=True)
    return vcount


async def index_all() -> int:
    """Полный проход: синк каналов + индексация каждого."""
    async with _lock:
        client = await get_client()
        if client is None:
            print("[index] нет авторизации — пропускаю")
            return 0

        found = await sync_channels(client)
        channels = repo.get_channels()

        total = 0
        for ch in channels:
            try:
                n = await index_channel(client, ch)
                total += n
                print(f"[index] {ch['title'] or ch['id']}: +{n}")
            except Exception as e:  # noqa: BLE001
                print(f"[index] канал {ch['title'] or ch['id']} упал: {e}")
            await asyncio.sleep(0.8)  # мягкий троттлинг между каналами

        repo.refresh_feed_cache()
        print(
            f"[index] готово: каналов {len(channels)} (из диалогов {found}), "
            f"новых видео {total}, всего видео {repo.count_videos()}, "
            f"фото {repo.count_photos()}"
        )
        return total
