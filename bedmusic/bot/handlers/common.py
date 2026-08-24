from __future__ import annotations

from typing import Optional

from aiogram.exceptions import TelegramBadRequest
from aiogram.types import CallbackQuery, InlineKeyboardMarkup, Message

from .. import db, texts
from ..keyboards import back_to_menu


async def show(
    event: Message | CallbackQuery,
    text: str,
    markup: Optional[InlineKeyboardMarkup] = None,
) -> None:
    """Show a screen: edit the callback's message when possible, else send a new one.

    A message that carries a photo (profile cards) or audio cannot be turned into
    a text message by editing, so those fall back to sending.
    """
    if isinstance(event, Message):
        await event.answer(text, reply_markup=markup)
        return

    message = event.message
    if message is None:
        if event.from_user is not None:
            await event.bot.send_message(event.from_user.id, text, reply_markup=markup)
        return

    if message.text is not None:
        try:
            await message.edit_text(text, reply_markup=markup)
            return
        except TelegramBadRequest as exc:
            # "message is not modified" means the screen is already correct.
            if "message is not modified" in str(exc):
                return
    await message.answer(text, reply_markup=markup)


async def require_artist(event: Message | CallbackQuery) -> Optional[db.Artist]:
    """Return the caller's artist profile, or nudge them to register."""
    if event.from_user is None:
        return None
    artist = await db.get_artist(event.from_user.id)
    if artist is None:
        if isinstance(event, CallbackQuery):
            await event.answer(texts.NEED_REGISTRATION, show_alert=True)
        else:
            await show(event, texts.NEED_REGISTRATION, back_to_menu())
    return artist
