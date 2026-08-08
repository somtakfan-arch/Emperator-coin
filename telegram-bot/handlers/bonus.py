from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

import database as db
from config import DAILY_BONUS_AMOUNT, DAILY_BONUS_COOLDOWN_HOURS
from keyboards import back_to_menu_kb

router = Router()


async def _claim_text(user_id: int) -> str:
    granted, hours_left = await db.claim_daily_bonus(
        user_id, DAILY_BONUS_AMOUNT, DAILY_BONUS_COOLDOWN_HOURS
    )
    if granted:
        balance = await db.get_balance(user_id)
        return f"🎁 Вы получили {DAILY_BONUS_AMOUNT} фишек!\nБаланс: {balance} 🪙"
    hours = int(hours_left)
    minutes = int((hours_left - hours) * 60)
    return f"⏳ Бонус уже получен. Приходите через {hours} ч {minutes} мин."


@router.message(Command("bonus"))
async def cmd_bonus(message: Message) -> None:
    await db.get_or_create_user(message.from_user.id, message.from_user.username)
    text = await _claim_text(message.from_user.id)
    await message.answer(text, reply_markup=back_to_menu_kb())


@router.callback_query(F.data == "menu:bonus")
async def cb_bonus(callback: CallbackQuery) -> None:
    await db.get_or_create_user(callback.from_user.id, callback.from_user.username)
    text = await _claim_text(callback.from_user.id)
    await callback.message.edit_text(text, reply_markup=back_to_menu_kb())
    await callback.answer()
