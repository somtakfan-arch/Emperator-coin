import asyncio

from aiogram import F, Router
from aiogram.types import CallbackQuery

import database as db
from games import slots
from keyboards import back_to_menu_kb, bet_amount_kb

router = Router()


@router.callback_query(F.data == "menu:slots")
async def cb_menu(callback: CallbackQuery) -> None:
    balance = await db.get_balance(callback.from_user.id)
    await callback.message.edit_text(
        f"🎰 <b>Слоты</b>\nТри одинаковых символа — выигрыш (до x20)!\nВыберите ставку (баланс: {balance} 🪙):",
        reply_markup=bet_amount_kb("slots", balance),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("bet:slots:"))
async def cb_play(callback: CallbackQuery) -> None:
    amount = int(callback.data.split(":")[2])

    if not await db.try_place_bet(callback.from_user.id, amount):
        await callback.answer("Недостаточно фишек!", show_alert=True)
        return
    await callback.answer()

    await callback.message.edit_text(f"🎰 Крутим барабаны... ставка {amount} 🪙")
    dice_msg = await callback.message.answer_dice(emoji="🎰")
    value = dice_msg.dice.value
    await asyncio.sleep(3)

    result = slots.resolve(amount, value)
    if result.won:
        await db.pay_winnings(callback.from_user.id, result.payout)

    balance = await db.get_balance(callback.from_user.id)
    reels_str = " ".join(result.reels)
    if result.won:
        text = f"{reels_str}\n✅ Вы выиграли {result.payout} 🪙 (x{result.multiplier:g})\nБаланс: {balance} 🪙"
    else:
        text = f"{reels_str}\n❌ Вы проиграли {amount} 🪙\nБаланс: {balance} 🪙"

    await callback.message.answer(text, reply_markup=back_to_menu_kb())
