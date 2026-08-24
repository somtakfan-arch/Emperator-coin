from __future__ import annotations

from aiogram import Router
from aiogram.types import CallbackQuery, Message

from .. import db, keyboards, texts

router = Router(name="fallback")


@router.message()
async def unknown_message(message: Message) -> None:
    """Anything sent outside a conversation step lands here."""
    if message.from_user is None:
        return
    artist = await db.get_artist(message.from_user.id)
    markup = keyboards.main_menu() if artist else keyboards.register()
    await message.answer(texts.UNKNOWN, reply_markup=markup)


@router.callback_query()
async def unknown_callback(callback: CallbackQuery) -> None:
    """Stale buttons from an older session — acknowledge instead of spinning."""
    await callback.answer("⌛️ Кнопка устарела. Открой меню: /menu", show_alert=True)
