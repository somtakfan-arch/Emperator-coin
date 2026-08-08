from aiogram import F, Router
from aiogram.types import CallbackQuery

import database as db
from config import COINFLIP_EDGE_CHANCE, COINFLIP_MULTIPLIER
from games import coinflip
from keyboards import coinflip_side_kb, play_again_kb
from .common import show_bet_screen

router = Router()

SIDE_LABEL = {"heads": "🦅 Орёл", "tails": "🪙 Решка"}

DESCRIPTION = (
    "🪙 <b>Монетка</b>\n"
    f"Угадали сторону — выплата x{COINFLIP_MULTIPLIER:g}.\n"
    f"Но с шансом {COINFLIP_EDGE_CHANCE:.0%} монета встаёт на ребро — "
    "тогда ставку забирает казино."
)


@router.callback_query(F.data == "menu:coinflip")
async def cb_menu(callback: CallbackQuery) -> None:
    await show_bet_screen(callback, "coinflip", DESCRIPTION)


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
    if result.outcome == "edge":
        text = f"🪙 Ребро! Монета не упала ни на одну сторону.\n❌ Вы проиграли {amount} 🪙"
    elif result.won:
        text = f"{SIDE_LABEL[result.outcome]}!\n✅ Вы выиграли {result.payout} 🪙"
    else:
        text = f"{SIDE_LABEL[result.outcome]}!\n❌ Вы проиграли {amount} 🪙"

    await callback.message.edit_text(
        f"{text}\nБаланс: {balance} 🪙", reply_markup=play_again_kb("coinflip")
    )
    await callback.answer()
