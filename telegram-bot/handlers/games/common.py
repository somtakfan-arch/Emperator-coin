from aiogram.types import CallbackQuery

import database as db
from config import MIN_BET
from handlers.utils import safe_edit
from keyboards import bet_amount_kb


async def show_bet_screen(callback: CallbackQuery, game: str, description: str) -> None:
    """Shared first screen of every game: rules + odds, then the bet picker."""
    balance = await db.get_balance(callback.from_user.id)
    if balance < MIN_BET:
        tail = (
            f"Ваш баланс: {balance} 🪙\n"
            f"Минимальная ставка — {MIN_BET}. Заберите 🎁 бонус или пополните счёт ⭐."
        )
    else:
        tail = f"Ваш баланс: {balance} 🪙\nВыберите ставку:"

    await safe_edit(
        callback.message, f"{description}\n\n{tail}", reply_markup=bet_amount_kb(game, balance)
    )
    await callback.answer()
