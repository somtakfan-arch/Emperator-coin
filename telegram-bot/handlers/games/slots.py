import asyncio

from aiogram import F, Router
from aiogram.types import CallbackQuery

import database as db
from config import SLOTS_PAYOUTS
from games import slots
from keyboards import play_again_kb
from .common import show_bet_screen

router = Router()

# 4 winning combos out of the 64 outcomes Telegram's slot machine can return.
WIN_CHANCE = 4 / 64

DESCRIPTION = (
    "🎰 <b>Слоты</b>\n"
    "Барабаны крутит сам Telegram. Выигрывают только три одинаковых символа — "
    f"это {WIN_CHANCE:.1%} спинов.\n"
    f"🍫 x{SLOTS_PAYOUTS[0]:g} · 🍇 x{SLOTS_PAYOUTS[1]:g} · "
    f"🍋 x{SLOTS_PAYOUTS[2]:g} · 7️⃣ x{SLOTS_PAYOUTS[3]:g}"
)


@router.callback_query(F.data == "menu:slots")
async def cb_menu(callback: CallbackQuery) -> None:
    await show_bet_screen(callback, "slots", DESCRIPTION)


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
        text = f"{reels_str}\n✅ Вы выиграли {result.payout} 🪙 (x{result.multiplier:g})"
    else:
        text = f"{reels_str}\n❌ Вы проиграли {amount} 🪙"

    await callback.message.answer(
        f"{text}\nБаланс: {balance} 🪙", reply_markup=play_again_kb("slots")
    )
