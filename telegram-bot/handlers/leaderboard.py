from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

import database as db
from handlers.utils import safe_edit
from keyboards import back_to_menu_kb

router = Router()


async def _leaderboard_text() -> str:
    rows = await db.top_balances(10)
    if not rows:
        return "Пока никто не играл 🙃"
    lines = ["🏆 <b>Топ игроков по балансу</b>\n"]
    medals = ["🥇", "🥈", "🥉"]
    for i, row in enumerate(rows):
        name = f"@{row['username']}" if row["username"] else f"id{row['user_id']}"
        prefix = medals[i] if i < 3 else f"{i + 1}."
        lines.append(f"{prefix} {name} — {row['balance']} 🪙")
    return "\n".join(lines)


@router.message(Command("top"))
async def cmd_top(message: Message) -> None:
    await message.answer(await _leaderboard_text(), reply_markup=back_to_menu_kb())


@router.callback_query(F.data == "menu:top")
async def cb_top(callback: CallbackQuery) -> None:
    await safe_edit(callback.message, await _leaderboard_text(), reply_markup=back_to_menu_kb())
    await callback.answer()
