"""BedCoin (BED) in-bot economy: demand-driven price.

Price rises with total demand: price = base * (1 + total_sold / scale). The
running total of BED ever sold is kept in the settings table so the curve
survives restarts. The on-chain jetton deposit/withdraw layer plugs in later.
"""
from . import config

_SOLD_KEY = "bed_sold"


def total_sold(storage) -> float:
    try:
        return float(storage.get_setting(_SOLD_KEY, "0") or 0)
    except (TypeError, ValueError):
        return 0.0


def price_stars(storage) -> float:
    """Current price in ⭐ Stars per 1 BED."""
    return config.BED_BASE_PRICE_STARS * (1 + total_sold(storage) / config.BED_DEMAND_SCALE)


def cost_stars(storage, bed_amount: int) -> int:
    """Whole-Star cost to buy `bed_amount` BED right now (min 1)."""
    return max(1, round(price_stars(storage) * bed_amount))


def record_sale(storage, bed_amount: int) -> None:
    """Register a purchase so the price ticks up for the next buyer."""
    storage.set_setting(_SOLD_KEY, str(total_sold(storage) + bed_amount))


def fmt_price(storage) -> str:
    p = price_stars(storage)
    return f"{p:.2f}".rstrip("0").rstrip(".")
