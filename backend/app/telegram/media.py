from telethon.tl.types import (
    Channel,
    Document,
    DocumentAttributeFilename,
    DocumentAttributeVideo,
    InputPeerChannel,
    Message,
)


def channel_peer(row) -> InputPeerChannel:
    """InputPeerChannel из строки БД (id/access_hash хранятся строками)."""
    return InputPeerChannel(int(row["id"]), int(row["access_hash"]))


def video_attr(doc: Document) -> DocumentAttributeVideo | None:
    for a in doc.attributes:
        if isinstance(a, DocumentAttributeVideo):
            return a
    return None


def file_name_of(doc: Document) -> str | None:
    for a in doc.attributes:
        if isinstance(a, DocumentAttributeFilename):
            return a.file_name
    return None


def message_video_doc(msg: Message) -> Document | None:
    """Вернуть документ, если сообщение содержит видео-файл, иначе None."""
    doc = getattr(msg, "document", None)
    if not isinstance(doc, Document):
        return None
    mime = doc.mime_type or ""
    if not mime.startswith("video"):
        return None
    if video_attr(doc) is None:
        return None
    return doc


def is_wanted_channel(entity, include_groups: bool) -> bool:
    if not isinstance(entity, Channel):
        return False
    if entity.broadcast:
        return True
    return include_groups and bool(entity.megagroup)
