"""Currencies and amounts.

Amounts are integers in the smallest unit of each currency, never floats —
binary floating point cannot represent 0.1 exactly, and these numbers are
someone's money.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation


@dataclass(frozen=True)
class Currency:
    code: str
    decimals: int
    title: str
    min_amount: int  # smallest sane listing price, in smallest units


CURRENCIES = {
    "BED": Currency("BED", 9, "BedCoin", 1_000_000),          # 0.001 BED
    "TON": Currency("TON", 9, "Toncoin", 10_000_000),         # 0.01 TON
    "USDT": Currency("USDT", 6, "Tether USDT", 100_000),      # 0.1 USDT
}

ORDER = ["BED", "TON", "USDT"]


class AmountError(ValueError):
    """Raised when a user-typed amount cannot be used as a price."""


def currency(code: str) -> Currency:
    try:
        return CURRENCIES[code.upper()]
    except KeyError:
        raise AmountError(f"unknown currency {code!r}") from None


def parse_amount(text: str, code: str) -> int:
    """Turn user input ("1,5", "0.25", "10") into smallest units."""
    cur = currency(code)
    cleaned = text.strip().replace(",", ".").replace(" ", "").replace(" ", "")
    if not cleaned:
        raise AmountError("empty amount")

    try:
        value = Decimal(cleaned)
    except InvalidOperation:
        raise AmountError(f"{text!r} is not a number") from None

    if value <= 0:
        raise AmountError("amount must be positive")

    scaled = value * (10**cur.decimals)
    if scaled != scaled.to_integral_value():
        raise AmountError(f"{cur.code} supports at most {cur.decimals} decimal places")

    units = int(scaled)
    if units < cur.min_amount:
        raise AmountError(
            f"minimum is {format_amount(cur.min_amount, cur.code)}"
        )
    return units


def format_amount(units: int, code: str, with_code: bool = True) -> str:
    """Render smallest units for humans, without trailing zero noise."""
    cur = currency(code)
    sign = "-" if units < 0 else ""
    whole, frac = divmod(abs(units), 10**cur.decimals)

    if frac:
        text = f"{whole}.{str(frac).zfill(cur.decimals).rstrip('0')}"
    else:
        text = str(whole)

    return f"{sign}{text} {cur.code}" if with_code else f"{sign}{text}"


SMALLEST_UNIT = {
    "TON": "нанотон",
    "BED": "минимальных единиц BED (10⁻⁹)",
    "USDT": "минимальных единиц USDT (10⁻⁶)",
}


def amount_exact(units: int, code: str) -> str:
    """The unambiguous restatement a contract puts in parentheses.

    A rouble contract spells the sum out in words. Doing that for a decimal
    crypto amount would mean inventing Russian declensions for fractional
    tickers, so instead the sum is restated exactly in indivisible units —
    which is what actually settles on-chain and cannot be misread.
    """
    cur = currency(code)
    return f"{units} {SMALLEST_UNIT.get(cur.code, 'минимальных единиц')}"
