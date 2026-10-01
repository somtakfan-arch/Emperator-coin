from typing import Optional, Tuple

from telegram import Message

# kind -> (deleted_label, one_time_label, supports_caption)
# `kind` doubles as the send_<kind> method name and its file kwarg name.
MEDIA_KINDS = {
    "photo": ("Фото", "одноразовое фото", True),
    "animation": ("GIF", "одноразовый GIF", True),
    "video": ("Видео", "одноразовое видео", True),
    "video_note": ("Кружок", "одноразовый кружок", False),
    "voice": ("Голосовое", "одноразовое голосовое", True),
    "audio": ("Аудио", "одноразовое аудио", True),
    "sticker": ("Стикер", "одноразовый стикер", False),
    "document": ("Документ", "одноразовый документ", True),
}


def extract_media(message: Message) -> Tuple[Optional[str], Optional[str]]:
    """Return (kind, file_id) for the first media attachment, or (None, None)."""
    if message.photo:
        return "photo", message.photo[-1].file_id
    if message.animation:
        return "animation", message.animation.file_id
    if message.video:
        return "video", message.video.file_id
    if message.video_note:
        return "video_note", message.video_note.file_id
    if message.voice:
        return "voice", message.voice.file_id
    if message.audio:
        return "audio", message.audio.file_id
    if message.sticker:
        return "sticker", message.sticker.file_id
    if message.document:
        return "document", message.document.file_id
    return None, None


def supports_caption(kind: str) -> bool:
    return MEDIA_KINDS.get(kind, (None, None, False))[2]
