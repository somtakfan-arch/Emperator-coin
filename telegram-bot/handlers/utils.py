from aiogram.exceptions import TelegramBadRequest
from aiogram.types import InlineKeyboardMarkup, Message


async def safe_edit(
    message: Message, text: str, reply_markup: InlineKeyboardMarkup | None = None
) -> None:
    """edit_text that tolerates re-opening a screen that is already shown.

    With "back" buttons the same screen can be re-entered from an old message,
    and Telegram rejects an edit that changes nothing. That is not an error for
    us — the user is already looking at what he asked for.
    """
    try:
        await message.edit_text(text, reply_markup=reply_markup)
    except TelegramBadRequest as exc:
        if "message is not modified" not in str(exc):
            raise
