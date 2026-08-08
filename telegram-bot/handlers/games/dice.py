import asyncio

from aiogram import F, Router
from aiogram.types import CallbackQuery

import database as db
from games import dice
from keyboards import dice_number_kb, dice_type_kb, play_again_kb
from .common import show_bet_screen

router = Router()

TYPE_LABEL = {
    "high": "⬆️ 5 или 6",
    "low": "⬇️ 1 или 2",
    "even": "➗ Чёт",
    "odd": "➕ Нечёт",
}

DESCRIPTION = (
    "🎲 <b>Кости</b>\n"
    "Бросок — нативный кубик Telegram, результат приходит с его серверов.\n"
    "Ставка «5 или 6» и «1 или 2» выигрывает в 2 случаях из 6, "
    "чёт/нечёт — в 3 из 6, точное число — в 1 из 6."
)


@router.callback_query(F.data == "menu:dice")
async def cb_menu(callback: CallbackQuery) -> None:
    await show_bet_screen(callback, "dice", DESCRIPTION)


@router.callback_query(F.data.startswith("bet:dice:"))
async def cb_bet(callback: CallbackQuery) -> None:
    amount = int(callback.data.split(":")[2])
    await callback.message.edit_text(
        f"🎲 Ставка: {amount} 🪙\nНа что ставим?",
        reply_markup=dice_type_kb(amount),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("dicetype:"))
async def cb_type(callback: CallbackQuery) -> None:
    _, amount, bet_type = callback.data.split(":")
    amount = int(amount)

    if bet_type == "number":
        await callback.message.edit_text(
            f"🎲 Ставка: {amount} 🪙\nВыберите число 1-6:",
            reply_markup=dice_number_kb(amount),
        )
        await callback.answer()
        return

    await _resolve(callback, amount, bet_type, guess=None)


@router.callback_query(F.data.startswith("dicenum:"))
async def cb_number(callback: CallbackQuery) -> None:
    _, amount, guess = callback.data.split(":")
    await _resolve(callback, int(amount), "number", guess=int(guess))


async def _resolve(callback: CallbackQuery, amount: int, bet_type: str, guess: int | None) -> None:
    if not await db.try_place_bet(callback.from_user.id, amount):
        await callback.answer("Недостаточно фишек!", show_alert=True)
        return
    await callback.answer()

    label = TYPE_LABEL.get(bet_type, f"число {guess}")
    await callback.message.edit_text(f"🎲 Бросаем кости... ставка {amount} 🪙 на {label}")

    dice_msg = await callback.message.answer_dice(emoji="🎲")
    value = dice_msg.dice.value
    await asyncio.sleep(3)

    result = dice.resolve(amount, bet_type, value, guess)
    if result.won:
        await db.pay_winnings(callback.from_user.id, result.payout)

    balance = await db.get_balance(callback.from_user.id)
    if result.won:
        text = f"🎲 Выпало: {value}\n✅ Вы выиграли {result.payout} 🪙"
    else:
        text = f"🎲 Выпало: {value}\n❌ Вы проиграли {amount} 🪙"

    await callback.message.answer(
        f"{text}\nБаланс: {balance} 🪙", reply_markup=play_again_kb("dice")
    )
