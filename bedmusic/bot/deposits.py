"""Background poller that credits on-chain deposits to internal balances."""

from __future__ import annotations

import asyncio
import logging

from aiogram import Bot

from . import db, texts
from .ton import Treasury

log = logging.getLogger("bedmusic.deposits")


async def poll_once(bot: Bot, treasury: Treasury) -> int:
    """Credit every unseen deposit. Returns how many were credited."""
    try:
        found = await treasury.fetch_deposits()
    except Exception:  # noqa: BLE001 — a flaky RPC must not kill the loop
        log.exception("deposit poll failed")
        return 0

    credited = 0
    for deposit in found:
        # record_deposit claims the tx first: if it returns False another pass
        # already credited it, and crediting again would mint free money.
        if not await db.record_deposit(
            deposit.tx_hash, deposit.user_id, deposit.currency,
            deposit.amount, deposit.sender,
        ):
            continue

        await db.credit(
            deposit.user_id, deposit.currency, deposit.amount, reason="deposit"
        )
        credited += 1
        log.info(
            "credited %s %s to %s (tx %s)",
            deposit.amount, deposit.currency, deposit.user_id, deposit.tx_hash[:16],
        )

        try:
            await bot.send_message(
                deposit.user_id,
                texts.deposit_credited(deposit.amount, deposit.currency),
            )
        except Exception:  # noqa: BLE001 — the credit stands even if the DM fails
            log.warning("could not notify %s about deposit", deposit.user_id)

    return credited


async def run(bot: Bot, treasury: Treasury, interval: int) -> None:
    if not treasury.configured:
        log.info("treasury not configured; deposit polling disabled")
        return

    log.info("watching %s for deposits every %ss", treasury.address, interval)
    while True:
        await poll_once(bot, treasury)
        await asyncio.sleep(interval)
