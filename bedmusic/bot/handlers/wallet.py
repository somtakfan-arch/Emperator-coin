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
from aiogram.types import CallbackQuery, Message

from .. import db, keyboards, money, texts
from ..config import Config
from .common import show

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


@router.callback_query(F.data.in_({"wallet:deposit", "wallet:withdraw"}))
async def cb_onchain(callback: CallbackQuery, config: Config) -> None:
    await callback.answer()
    if not config.treasury_configured:
        await show(callback, texts.ONCHAIN_OFF, keyboards.wallet(True))
        return
    await show(callback, texts.ONCHAIN_SOON, keyboards.wallet(True))


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
async def cmd_audit(message: Message, config: Config) -> None:
    """Admin-only: what the service currently owes."""
    if message.from_user is None or message.from_user.id not in config.admin_ids:
        return
    held = await db.total_held()
    await message.answer(texts.audit_card(held))
