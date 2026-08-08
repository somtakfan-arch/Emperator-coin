from aiogram import F, Router
from aiogram.types import CallbackQuery

import database as db
from games import roulette
from keyboards import back_to_menu_kb, bet_amount_kb, roulette_bet_kb

router = Router()

BET_LABEL = {
    "red": "🔴 Красное",
    "black": "⚫ Чёрное",
    "even": "➗ Чёт",
    "odd": "➕ Нечёт",
    "low": "1-18",
    "high": "19-36",
    "zero": "0️⃣ Зеро",
}

COLOR_EMOJI = {"red": "🔴", "black": "⚫", "green": "🟢"}


@router.callback_query(F.data == "menu:roulette")
async def cb_menu(callback: CallbackQuery) -> None:
    balance = await db.get_balance(callback.from_user.id)
    await callback.message.edit_text(
        f"🎡 <b>Рулетка</b>\nЕвропейская, одно зеро.\nВыберите ставку (баланс: {balance} 🪙):",
        reply_markup=bet_amount_kb("roulette", balance),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("bet:roulette:"))
async def cb_bet(callback: CallbackQuery) -> None:
    amount = int(callback.data.split(":")[2])
    await callback.message.edit_text(
        f"🎡 Ставка: {amount} 🪙\nНа что ставим?",
        reply_markup=roulette_bet_kb(amount),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("roulette:"))
async def cb_play(callback: CallbackQuery) -> None:
    _, amount, bet_type = callback.data.split(":")
    amount = int(amount)

    if not await db.try_place_bet(callback.from_user.id, amount):
        await callback.answer("Недостаточно фишек!", show_alert=True)
        return
    await callback.answer()

    await callback.message.edit_text(f"🎡 Крутим рулетку... ставка {amount} 🪙 на {BET_LABEL[bet_type]}")

    number = roulette.spin()
    result = roulette.resolve(amount, bet_type, number)
    if result.won:
        await db.pay_winnings(callback.from_user.id, result.payout)

    balance = await db.get_balance(callback.from_user.id)
    color_emoji = COLOR_EMOJI[result.color]
    if result.won:
        text = (
            f"{color_emoji} Выпало: {number}\n"
            f"✅ Вы выиграли {result.payout} 🪙 (x{result.multiplier:g})\nБаланс: {balance} 🪙"
        )
    else:
        text = f"{color_emoji} Выпало: {number}\n❌ Вы проиграли {amount} 🪙\nБаланс: {balance} 🪙"

    await callback.message.answer(text, reply_markup=back_to_menu_kb())
