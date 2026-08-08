from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

import database as db
from keyboards import back_to_menu_kb

router = Router()


def _stats_text(user_id: int, username: str | None, stats) -> str:
    name = f"@{username}" if username else str(user_id)
    return (
        f"👤 <b>{name}</b>\n\n"
        f"🪙 Баланс: <b>{stats['balance']}</b>\n"
        f"🎮 Игр сыграно: {stats['games_played']}\n"
        f"📈 Всего поставлено: {stats['total_wagered']}\n"
        f"💵 Всего выиграно: {stats['total_won']}"
    )


@router.message(Command("balance"))
async def cmd_balance(message: Message) -> None:
    await db.get_or_create_user(message.from_user.id, message.from_user.username)
    stats = await db.get_stats(message.from_user.id)
    await message.answer(
        _stats_text(message.from_user.id, message.from_user.username, stats),
        reply_markup=back_to_menu_kb(),
    )


@router.callback_query(F.data == "menu:balance")
async def cb_balance(callback: CallbackQuery) -> None:
    await db.get_or_create_user(callback.from_user.id, callback.from_user.username)
    stats = await db.get_stats(callback.from_user.id)
    await callback.message.edit_text(
        _stats_text(callback.from_user.id, callback.from_user.username, stats),
        reply_markup=back_to_menu_kb(),
    )
    await callback.answer()
