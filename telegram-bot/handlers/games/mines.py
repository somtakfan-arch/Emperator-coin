from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

import database as db
from config import MINES_MAX_MULTIPLIER, MINES_RTP
from games import mines
from handlers.states import MinesStates
from handlers.utils import safe_edit
from keyboards import mines_board_kb, mines_count_kb, mines_size_kb
from .common import show_bet_screen

router = Router()

DESCRIPTION = (
    "💣 <b>Мины</b>\n"
    "Открывайте клетки: каждая безопасная поднимает множитель, мина — "
    "и ставка сгорает целиком.\n"
    "Забрать выигрыш можно в любой момент, но только пока не подорвались.\n"
    f"Чем больше мин, тем выше множитель. Потолок выигрыша — "
    f"x{MINES_MAX_MULTIPLIER:g}."
)


@router.callback_query(F.data == "menu:mines")
async def cb_menu(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await show_bet_screen(callback, "mines", DESCRIPTION)


@router.callback_query(F.data.startswith("bet:mines:"))
async def cb_size(callback: CallbackQuery) -> None:
    amount = int(callback.data.split(":")[2])
    await safe_edit(
        callback.message,
        f"💣 Ставка: {amount} 🪙\nВыберите размер поля:",
        reply_markup=mines_size_kb(amount),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("msize:"))
async def cb_count(callback: CallbackQuery) -> None:
    _, amount, size = callback.data.split(":")
    amount, size = int(amount), int(size)
    await safe_edit(
        callback.message,
        f"💣 Ставка: {amount} 🪙 · поле {size}x{size}\n"
        "Сколько мин? Рядом — множитель за первую открытую клетку:",
        reply_markup=mines_count_kb(amount, size),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("mcount:"))
async def cb_start(callback: CallbackQuery, state: FSMContext) -> None:
    _, amount, size, count = callback.data.split(":")
    amount, size, count = int(amount), int(size), int(count)

    if not await db.try_place_bet(callback.from_user.id, amount):
        await callback.answer("Недостаточно фишек!", show_alert=True)
        return

    game = mines.new_game(size=size, mines=count, bet=amount)
    await state.set_state(MinesStates.playing)
    await state.update_data(game=game)

    await safe_edit(callback.message, _board_text(game), reply_markup=mines_board_kb(game))
    await callback.answer()


@router.callback_query(F.data == "mnoop")
async def cb_noop(callback: CallbackQuery) -> None:
    await callback.answer()


@router.callback_query(F.data.startswith("mopen:"), MinesStates.playing)
async def cb_open(callback: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    game: mines.MinesGame | None = data.get("game")
    if game is None or game.finished:
        await callback.answer("Раунд уже закончен", show_alert=True)
        return

    index = int(callback.data.split(":")[1])
    safe = game.open_cell(index)

    if not safe:
        await state.clear()
        balance = await db.get_balance(callback.from_user.id)
        await safe_edit(
            callback.message,
            f"💥 <b>Мина!</b>\nСтавка {game.bet} 🪙 сгорела.\n"
            f"Открыто клеток: {len(game.opened)} из {game.safe_total}\n"
            f"Баланс: {balance} 🪙",
            reply_markup=mines_board_kb(game, reveal=True),
        )
        await callback.answer("💥 Мина!", show_alert=False)
        return

    if game.cleared:
        # whole field swept — pay out at the final multiplier
        await _cash_out(callback, state, game, cleared=True)
        return

    await state.update_data(game=game)
    await safe_edit(callback.message, _board_text(game), reply_markup=mines_board_kb(game))
    await callback.answer()


@router.callback_query(F.data == "mcash", MinesStates.playing)
async def cb_cash(callback: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    game: mines.MinesGame | None = data.get("game")
    if game is None or game.finished or not game.opened:
        await callback.answer("Забирать пока нечего", show_alert=True)
        return
    await _cash_out(callback, state, game, cleared=False)


async def _cash_out(
    callback: CallbackQuery, state: FSMContext, game: mines.MinesGame, cleared: bool
) -> None:
    payout = game.payout()
    game.cashed_out = True
    await db.pay_winnings(callback.from_user.id, payout)
    await state.clear()

    balance = await db.get_balance(callback.from_user.id)
    header = "🏆 <b>Поле зачищено!</b>" if cleared else "💰 <b>Забрали вовремя!</b>"
    await safe_edit(
        callback.message,
        f"{header}\n"
        f"Открыто {len(game.opened)} из {game.safe_total} · "
        f"множитель x{game.current_multiplier():.2f}\n"
        f"Выигрыш: {payout} 🪙\nБаланс: {balance} 🪙",
        reply_markup=mines_board_kb(game, reveal=True),
    )
    await callback.answer()


# Registered last so the stateful handlers above win: state lives in memory,
# so a redeploy leaves old boards with buttons that match nothing. Without
# this the taps would silently do nothing and look like a frozen bot.
@router.callback_query(F.data.startswith("mopen:") | (F.data == "mcash"))
async def cb_expired(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.answer(
        "Этот раунд больше не активен — бот перезапускался. Начните новый.",
        show_alert=True,
    )


def _board_text(game: mines.MinesGame) -> str:
    if not game.opened:
        return (
            f"💣 <b>Мины</b> · {game.size}x{game.size} · {game.mines} мин\n"
            f"Ставка: {game.bet} 🪙\n\n"
            f"Первая клетка даёт x{game.next_multiplier():.2f}. Открывайте!"
        )
    return (
        f"💣 <b>Мины</b> · {game.size}x{game.size} · {game.mines} мин\n"
        f"Ставка: {game.bet} 🪙\n\n"
        f"Открыто: {len(game.opened)} из {game.safe_total}\n"
        f"Сейчас: x{game.current_multiplier():.2f} → {game.payout()} 🪙\n"
        f"Следующая клетка: x{game.next_multiplier():.2f}"
    )
