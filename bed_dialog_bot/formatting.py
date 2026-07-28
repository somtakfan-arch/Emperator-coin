from typing import Optional


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


def with_watermark(text: str, bot_username: Optional[str], is_premium: bool) -> str:
    if is_premium or not bot_username:
        return text
    return f"{text}\n\n@{bot_username} - Диалоги это просто."
