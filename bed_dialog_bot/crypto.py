"""Minimal async client for Crypto Pay (@CryptoBot) — the Crypto Pay API.

Only the two calls we need: createInvoice (to get a pay URL) and getInvoices
(to poll whether an invoice was paid). No external SDK — just httpx, which
python-telegram-bot already depends on. The feature is inert unless
CRYPTO_PAY_TOKEN is configured.
"""
import logging

import httpx

from . import config

logger = logging.getLogger(__name__)


def is_enabled() -> bool:
    return bool(config.CRYPTO_PAY_TOKEN)


def _headers() -> dict:
    return {"Crypto-Pay-API-Token": config.CRYPTO_PAY_TOKEN}


async def create_invoice(amount: float, description: str, payload: str):
    """Create an invoice. Returns the invoice dict (with invoice_id and
    pay/bot URLs) or None on failure."""
    if not is_enabled():
        return None
    body = {
        "asset": config.CRYPTO_PAY_ASSET,
        "amount": str(amount),
        "description": description[:1024],
        "payload": payload[:4096],
        "expires_in": 3600,
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{config.CRYPTO_PAY_BASE}/createInvoice",
                json=body,
                headers=_headers(),
            )
        data = resp.json()
    except Exception:
        logger.exception("Crypto Pay createInvoice failed")
        return None
    if not data.get("ok"):
        logger.warning("Crypto Pay createInvoice error: %s", data)
        return None
    return data["result"]


async def get_invoices(invoice_ids):
    """Return a list of invoice dicts for the given ids (any status)."""
    if not is_enabled() or not invoice_ids:
        return []
    params = {"invoice_ids": ",".join(str(i) for i in invoice_ids)}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"{config.CRYPTO_PAY_BASE}/getInvoices",
                params=params,
                headers=_headers(),
            )
        data = resp.json()
    except Exception:
        logger.exception("Crypto Pay getInvoices failed")
        return []
    if not data.get("ok"):
        logger.warning("Crypto Pay getInvoices error: %s", data)
        return []
    return data["result"].get("items", [])
