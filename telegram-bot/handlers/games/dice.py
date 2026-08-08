import asyncio

from aiogram import F, Router
from aiogram.types import CallbackQuery

import database as db
from games import dice
from keyboards import back_to_menu_kb, bet_amount_kb, dice_number_kb, dice_type_kb

router = Router()

TYPE_LABEL = {
    "high": "⬆️ Больше 3",
    "low": "⬇️ Меньше 4",
    "even": "➗ Чёт",
    "odd": "➕ Нечёт",
}


@router.callback_query(F.data == "menu:dice")
async def cb_menu(callback: CallbackQuery) -> None:
    balance = await db.get_balance(callback.from_user.id)
    await callback.message.edit_text(
        f"🎲 <b>Кости</b>\nВыберите ставку (баланс: {balance} 🪙):",
        reply_markup=bet_amount_kb("dice", balance),
    )
    await callback.answer()


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

    await callback.message.edit_text(f"🎲 Бросаем кости... ставка {amount} 🪙, {TYPE_LABEL.get(bet_type, 'число ' + str(guess))}")
    dice_msg = await callback.message.answer_dice(emoji="🎲")
    value = dice_msg.dice.value
    await asyncio.sleep(3)

    result = dice.resolve(amount, bet_type, value, guess)
    if result.won:
        await db.pay_winnings(callback.from_user.id, result.payout)

    balance = await db.get_balance(callback.from_user.id)
    if result.won:
        text = f"🎲 Выпало: {value}\n✅ Вы выиграли {result.payout} 🪙\nБаланс: {balance} 🪙"
    else:
        text = f"🎲 Выпало: {value}\n❌ Вы проиграли {amount} 🪙\nБаланс: {balance} 🪙"

    await callback.message.answer(text, reply_markup=back_to_menu_kb())
