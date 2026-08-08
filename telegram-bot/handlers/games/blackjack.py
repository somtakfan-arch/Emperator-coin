from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

import database as db
from config import BLACKJACK_BLACKJACK_MULTIPLIER, BLACKJACK_WIN_MULTIPLIER
from games.blackjack import BlackjackGame, hand_value, is_blackjack
from handlers.states import BlackjackStates
from keyboards import blackjack_action_kb, play_again_kb
from .common import show_bet_screen

router = Router()

DESCRIPTION = (
    "🃏 <b>Блэкджек</b>\n"
    "Наберите больше дилера, но не больше 21. Дилер добирает до 17.\n"
    f"Победа — x{BLACKJACK_WIN_MULTIPLIER:g}, блэкджек — "
    f"x{BLACKJACK_BLACKJACK_MULTIPLIER:g}, ничья — возврат ставки.\n"
    "Перебор у вас — проигрыш сразу, даже если дилер потом тоже перебрал."
)


def _hand_text(cards: list[str]) -> str:
    return " ".join(cards)


async def _table_text(game: BlackjackGame, reveal_dealer: bool) -> str:
    player_line = f"Вы: {_hand_text(game.player)} ({hand_value(game.player)})"
    if reveal_dealer:
        dealer_line = f"Дилер: {_hand_text(game.dealer)} ({hand_value(game.dealer)})"
    else:
        dealer_line = f"Дилер: {game.dealer[0]} 🂠"
    return f"🃏 <b>Блэкджек</b> — ставка {game.bet} 🪙\n\n{dealer_line}\n{player_line}"


@router.callback_query(F.data == "menu:blackjack")
async def cb_menu(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await show_bet_screen(callback, "blackjack", DESCRIPTION)


@router.callback_query(F.data.startswith("bet:blackjack:"))
async def cb_start_hand(callback: CallbackQuery, state: FSMContext) -> None:
    amount = int(callback.data.split(":")[2])

    if not await db.try_place_bet(callback.from_user.id, amount):
        await callback.answer("Недостаточно фишек!", show_alert=True)
        return

    game = BlackjackGame(bet=amount)
    game.deal()

    if is_blackjack(game.player):
        await _finish(callback, state, game, extra_note=None)
        return

    await state.set_state(BlackjackStates.playing)
    await state.update_data(game=game)

    balance = await db.get_balance(callback.from_user.id)
    text = await _table_text(game, reveal_dealer=False) + f"\n\nБаланс: {balance} 🪙"
    can_double = balance >= amount
    await callback.message.edit_text(text, reply_markup=blackjack_action_kb(can_double))
    await callback.answer()


@router.callback_query(F.data == "bj:hit", BlackjackStates.playing)
async def cb_hit(callback: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    game: BlackjackGame = data["game"]
    game.player_hit()

    if hand_value(game.player) > 21:
        await _finish(callback, state, game, extra_note=None)
        return

    await state.update_data(game=game)
    text = await _table_text(game, reveal_dealer=False)
    await callback.message.edit_text(text, reply_markup=blackjack_action_kb(can_double=False))
    await callback.answer()


@router.callback_query(F.data == "bj:stand", BlackjackStates.playing)
async def cb_stand(callback: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    game: BlackjackGame = data["game"]
    game.dealer_play()
    await _finish(callback, state, game, extra_note=None)


@router.callback_query(F.data == "bj:double", BlackjackStates.playing)
async def cb_double(callback: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    game: BlackjackGame = data["game"]

    if not await db.try_place_bet(callback.from_user.id, game.bet):
        await callback.answer("Недостаточно фишек для удвоения!", show_alert=True)
        return

    extra_bet = game.bet
    game.bet *= 2
    game.player_hit()
    if hand_value(game.player) <= 21:
        game.dealer_play()
    await _finish(callback, state, game, extra_note=f"(удвоено, +{extra_bet} 🪙 к ставке)")


async def _finish(callback: CallbackQuery, state: FSMContext, game: BlackjackGame, extra_note: str | None) -> None:
    await state.clear()
    result, multiplier = game.outcome()
    payout = int(game.bet * multiplier)
    if payout > 0:
        await db.pay_winnings(callback.from_user.id, payout)

    balance = await db.get_balance(callback.from_user.id)
    table = await _table_text(game, reveal_dealer=True)

    labels = {
        "blackjack": f"🂡 Блэкджек! Вы выиграли {payout} 🪙",
        "win": f"✅ Вы выиграли {payout} 🪙",
        "push": f"🤝 Ничья, ставка возвращена ({payout} 🪙)",
        "lose": f"❌ Вы проиграли {game.bet} 🪙",
    }
    note = f"\n{extra_note}" if extra_note else ""
    text = f"{table}{note}\n\n{labels[result]}\nБаланс: {balance} 🪙"

    await callback.message.edit_text(text, reply_markup=play_again_kb("blackjack"))
    await callback.answer()
