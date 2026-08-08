from aiogram import F, Router
from aiogram.types import CallbackQuery

import database as db
from games import coinflip
from keyboards import back_to_menu_kb, bet_amount_kb, coinflip_side_kb

router = Router()

SIDE_LABEL = {"heads": "🦅 Орёл", "tails": "🪙 Решка"}


@router.callback_query(F.data == "menu:coinflip")
async def cb_menu(callback: CallbackQuery) -> None:
    balance = await db.get_balance(callback.from_user.id)
    await callback.message.edit_text(
        f"🪙 <b>Монетка</b>\nВыплата за угадывание: x1.9\nВаш баланс: {balance} 🪙\n\nВыберите ставку:",
        reply_markup=bet_amount_kb("coinflip", balance),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("bet:coinflip:"))
async def cb_bet(callback: CallbackQuery) -> None:
    amount = int(callback.data.split(":")[2])
    await callback.message.edit_text(
        f"🪙 Ставка: {amount} 🪙\nОрёл или решка?",
        reply_markup=coinflip_side_kb(amount),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("coinflip:"))
async def cb_play(callback: CallbackQuery) -> None:
    _, amount, choice = callback.data.split(":")
    amount = int(amount)

    if not await db.try_place_bet(callback.from_user.id, amount):
        await callback.answer("Недостаточно фишек!", show_alert=True)
        return

    result = coinflip.play(amount, choice)
    if result.won:
        await db.pay_winnings(callback.from_user.id, result.payout)

    balance = await db.get_balance(callback.from_user.id)
    outcome_label = SIDE_LABEL[result.outcome]
    if result.won:
        text = f"{outcome_label}!\n✅ Вы выиграли {result.payout} 🪙\nБаланс: {balance} 🪙"
    else:
        text = f"{outcome_label}!\n❌ Вы проиграли {amount} 🪙\nБаланс: {balance} 🪙"

    await callback.message.edit_text(text, reply_markup=back_to_menu_kb())
    await callback.answer()
