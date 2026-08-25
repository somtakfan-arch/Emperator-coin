"""Balances, top-up and payout.

The internal ledger is complete and settles deals on its own. Moving value in
and out of it needs a treasury wallet, which is configured separately — until
then those two buttons say so plainly instead of pretending to work.
"""

from __future__ import annotations

from typing import Union

from aiogram import F, Router
from aiogram.filters import Command, CommandObject
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from .. import db, deposits, keyboards, money, texts, ton
from ..config import Config
from ..ton import Treasury
from .common import show


class Withdraw(StatesGroup):
    address = State()
    amount = State()

router = Router(name="wallet")


@router.message(Command("wallet", "balance"))
async def cmd_wallet(message: Message, state: FSMContext) -> None:
    await state.clear()
    await _wallet(message)


@router.callback_query(F.data == "wallet")
async def cb_wallet(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.answer()
    await _wallet(callback)


async def _wallet(event: Union[Message, CallbackQuery]) -> None:
    if event.from_user is None:
        return
    balances = await db.all_balances(event.from_user.id)
    has_funds = any(v > 0 for v in balances.values())
    await show(event, texts.wallet_card(balances), keyboards.wallet(has_funds))


@router.callback_query(F.data == "wallet:history")
async def cb_history(callback: CallbackQuery) -> None:
    await callback.answer()
    if callback.from_user is None:
        return
    rows = await db.recent_ledger(callback.from_user.id)
    await show(callback, texts.ledger_card(rows), keyboards.wallet(True))


@router.callback_query(F.data == "wallet:deposit")
async def cb_deposit(callback: CallbackQuery, treasury: Treasury) -> None:
    await callback.answer()
    if callback.from_user is None:
        return
    if not treasury.configured:
        await show(callback, texts.ONCHAIN_OFF, keyboards.wallet(True))
        return
    memo = ton.memo_for(callback.from_user.id)
    await show(callback, texts.deposit_card(treasury.address, memo), keyboards.deposit(memo))


@router.callback_query(F.data == "wallet:check")
async def cb_check(callback: CallbackQuery, treasury: Treasury) -> None:
    """Impatience is fine — poll on demand instead of waiting for the loop."""
    await callback.answer(texts.CHECKING)
    credited = await deposits.poll_once(callback.bot, treasury)
    if not credited:
        await callback.answer(texts.NOTHING_YET, show_alert=True)
    await _wallet(callback)


@router.callback_query(F.data == "wallet:withdraw")
async def cb_withdraw(callback: CallbackQuery, state: FSMContext, treasury: Treasury) -> None:
    await callback.answer()
    if not treasury.configured:
        await show(callback, texts.ONCHAIN_OFF, keyboards.wallet(True))
        return
    if not treasury.withdrawals_enabled:
        await show(callback, texts.WITHDRAWALS_OFF, keyboards.wallet(True))
        return
    await state.clear()
    await show(callback, texts.WITHDRAW_PICK, keyboards.withdraw_picker())


@router.callback_query(F.data.startswith("wd:cur:"))
async def cb_withdraw_currency(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    if callback.from_user is None:
        return
    code = callback.data.rsplit(":", 1)[1]
    balance = await db.get_balance(callback.from_user.id, code)
    if balance <= 0:
        await callback.answer(texts.nothing_to_withdraw(code), show_alert=True)
        return
    await state.set_state(Withdraw.address)
    await state.update_data(code=code)
    await show(callback, texts.withdraw_ask_address(code, balance), keyboards.cancel("wallet"))


@router.message(Withdraw.address, F.text)
async def got_address(message: Message, state: FSMContext) -> None:
    address = (message.text or "").strip()
    if not ton.valid_address(address):
        await message.answer(texts.BAD_ADDRESS, reply_markup=keyboards.cancel("wallet"))
        return
    data = await state.get_data()
    await state.update_data(address=address)
    await state.set_state(Withdraw.amount)
    balance = await db.get_balance(message.from_user.id, data["code"])
    await message.answer(
        texts.withdraw_ask_amount(data["code"], balance),
        reply_markup=keyboards.cancel("wallet"),
    )


@router.message(Withdraw.amount, F.text)
async def got_amount(message: Message, state: FSMContext, treasury: Treasury) -> None:
    data = await state.get_data()
    code = data["code"]
    try:
        amount = money.parse_amount(message.text or "", code)
    except money.AmountError as exc:
        await message.answer(texts.bad_price(exc), reply_markup=keyboards.cancel("wallet"))
        return

    await state.clear()
    user_id = message.from_user.id

    # Debit first: if the transfer then fails the amount is credited back, but
    # the balance is never spendable while a payout is in flight.
    if not await db.debit(user_id, code, amount, reason="withdrawal"):
        have = await db.get_balance(user_id, code)
        await message.answer(
            texts.not_enough_funds(amount, have, code), reply_markup=keyboards.wallet(have > 0)
        )
        return

    wid = await db.create_withdrawal(user_id, code, amount, data["address"])
    await message.answer(texts.withdraw_sending(amount, code))

    try:
        tx = await treasury.send(code, data["address"], amount, comment="Bed Music")
    except Exception as exc:  # noqa: BLE001 — any failure must return the funds
        await db.set_withdrawal_status(wid, "failed")
        await db.credit(user_id, code, amount, reason="withdrawal_refund")
        await message.answer(
            texts.withdraw_failed(exc), reply_markup=keyboards.wallet(True)
        )
        return

    await db.set_withdrawal_status(wid, "sent", tx)
    await message.answer(texts.withdraw_sent(amount, code, tx), reply_markup=keyboards.wallet(True))


@router.message(Withdraw.address)
@router.message(Withdraw.amount)
async def withdraw_not_text(message: Message) -> None:
    await message.answer(texts.NEED_TEXT, reply_markup=keyboards.cancel("wallet"))


@router.message(Command("credit"))
async def cmd_credit(message: Message, command: CommandObject, config: Config) -> None:
    """Admin-only manual top-up: /credit <user_id> <amount> <CURRENCY>."""
    if message.from_user is None or message.from_user.id not in config.admin_ids:
        return

    parts = (command.args or "").split()
    if len(parts) != 3:
        await message.answer(texts.CREDIT_USAGE)
        return

    try:
        user_id = int(parts[0])
        code = parts[2].upper()
        amount = money.parse_amount(parts[1], code)
    except (ValueError, money.AmountError) as exc:
        await message.answer(texts.credit_failed(exc))
        return

    await db.credit(user_id, code, amount, reason="admin_credit")
    await message.answer(texts.credit_done(user_id, amount, code))
    try:
        await message.bot.send_message(user_id, texts.credited(amount, code))
    except Exception:  # noqa: BLE001 — the user may not have started the bot
        pass


@router.message(Command("audit"))
async def cmd_audit(message: Message, config: Config, treasury: Treasury) -> None:
    """Admin-only: does the on-chain reserve still cover what users are owed?"""
    if message.from_user is None or message.from_user.id not in config.admin_ids:
        return
    owed = await db.total_liability()
    held = await db.total_held()
    reserve = {}
    if treasury.configured:
        try:
            reserve = await treasury.balances()
        except Exception as exc:  # noqa: BLE001
            await message.answer(texts.audit_unavailable(exc))
    await message.answer(texts.audit_card(owed, held, reserve, treasury.address))
