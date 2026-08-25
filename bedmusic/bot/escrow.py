"""Escrow: the money side of a deal.

Funds move exactly three ways — held when the buyer asks to buy, released to
the seller when both sign, refunded to the buyer if the deal dies. Every
transition is guarded by the deal's escrow_state, so a duplicate button press
or a retried callback cannot pay twice.
"""

from __future__ import annotations

import logging

from . import db

log = logging.getLogger("bedmusic.escrow")

NONE = "none"
HELD = "held"
RELEASED = "released"
REFUNDED = "refunded"


class NotEnoughFunds(Exception):
    def __init__(self, need: int, have: int, code: str) -> None:
        self.need, self.have, self.code = need, have, code
        super().__init__(f"need {need} {code}, have {have}")


async def hold(deal: db.Deal) -> None:
    """Lock the buyer's funds for this deal."""
    if deal.escrow_state != NONE:
        return

    ok = await db.debit(
        deal.buyer_id, deal.price_currency, deal.price_amount,
        reason="escrow_hold", deal_id=deal.id,
    )
    if not ok:
        have = await db.get_balance(deal.buyer_id, deal.price_currency)
        raise NotEnoughFunds(deal.price_amount, have, deal.price_currency)

    await db.update_deal(deal.id, escrow_state=HELD)
    log.info("deal %s: held %s %s", deal.id, deal.price_amount, deal.price_currency)


async def release(deal: db.Deal) -> bool:
    """Pay the seller. Returns False if there was nothing held to pay out."""
    if deal.escrow_state != HELD:
        log.warning("deal %s: release skipped, escrow_state=%s", deal.id, deal.escrow_state)
        return False

    await db.credit(
        deal.seller_id, deal.price_currency, deal.price_amount,
        reason="escrow_release", deal_id=deal.id,
    )
    await db.update_deal(deal.id, escrow_state=RELEASED)
    log.info("deal %s: released %s %s to %s", deal.id, deal.price_amount,
             deal.price_currency, deal.seller_id)
    return True


async def refund(deal: db.Deal) -> bool:
    """Give the buyer their money back."""
    if deal.escrow_state != HELD:
        return False

    await db.credit(
        deal.buyer_id, deal.price_currency, deal.price_amount,
        reason="escrow_refund", deal_id=deal.id,
    )
    await db.update_deal(deal.id, escrow_state=REFUNDED)
    log.info("deal %s: refunded %s %s to %s", deal.id, deal.price_amount,
             deal.price_currency, deal.buyer_id)
    return True
