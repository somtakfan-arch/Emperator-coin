from typing import Optional

from .media import MEDIA_KINDS


def format_sender(name: str, username: Optional[str]) -> str:
    if username:
        return f"{name} (@{username})"
    return name


def format_deleted_text(name: str, username: Optional[str], text: str) -> str:
    return f"🗑 {format_sender(name, username)} удалил(а) Сообщение:\n\n{text}"


def format_deleted_photo_caption(name: str, username: Optional[str], caption: Optional[str]) -> str:
    header = f"🗑 {format_sender(name, username)} удалил(а) Фото:"
    if caption:
        return f"{header}\n\n{caption}"
    return header


def format_edited_text(name: str, username: Optional[str], old_text: str, new_text: str) -> str:
    return (
        f"✏️ {format_sender(name, username)} изменил(а) сообщение:\n\n"
        f"Old:\n{old_text}\n\nNew:\n{new_text}"
    )


def format_one_time_photo_caption(name: str, username: Optional[str]) -> str:
    return f"🔥 {format_sender(name, username)} отправил(а) одноразовое фото:"


def format_deleted_video_note_header(name: str, username: Optional[str]) -> str:
    return f"🗑 {format_sender(name, username)} удалил(а) Кружок:"


def format_one_time_video_note_header(name: str, username: Optional[str]) -> str:
    return f"🔥 {format_sender(name, username)} отправил(а) одноразовый кружок:"


def format_deleted_media(name: str, username: Optional[str], kind: str, caption: Optional[str] = None) -> str:
    label = MEDIA_KINDS[kind][0]
    header = f"🗑 {format_sender(name, username)} удалил(а) {label}:"
    if caption:
        return f"{header}\n\n{caption}"
    return header


def format_one_time_media(name: str, username: Optional[str], kind: str) -> str:
    label = MEDIA_KINDS[kind][1]
    return f"🔥 {format_sender(name, username)} отправил(а) {label}:"


def with_watermark(text: str, bot_username: Optional[str], is_premium: bool, custom: Optional[str] = None) -> str:
    if is_premium:
        # Premium removes the default mark; optional custom branding replaces it.
        return f"{text}\n\n{custom}" if custom else text
    if not bot_username:
        return text
    return f"{text}\n\n@{bot_username}"
