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


# Imperial holder tiers by BED balance — cosmetic flavour for the Wallet.
_RANKS = [
    (1000, "🏰 Император BedCoin"),
    (500, "💎 Герцог"),
    (100, "👑 Граф"),
    (50, "🎖 Барон"),
    (10, "🛡 Рыцарь"),
    (1, "🌾 Крестьянин"),
    (0, "👻 Нищий"),
]


def holder_rank(balance: int) -> str:
    for threshold, title in _RANKS:
        if balance >= threshold:
            return title
    return _RANKS[-1][1]


def next_rank(balance: int):
    """(title, needed) for the next tier up, or None at the top."""
    higher = [(t, title) for t, title in _RANKS if t > balance]
    if not higher:
        return None
    threshold, title = min(higher, key=lambda x: x[0])
    return (title, threshold - balance)


# --- treasury stats cache (written by the deposit loop, read by menus) ---

def cache_treasury(storage, bed: float, ton: float, addr: str) -> None:
    storage.set_setting("bed_treasury_bed", f"{bed:.9f}")
    storage.set_setting("bed_treasury_ton", f"{ton:.9f}")
    storage.set_setting("bed_treasury_addr", addr or "")


def treasury_cache(storage):
    """(bed, ton, addr) last snapshot, or (None, None, '') if never cached."""
    def _f(key):
        v = storage.get_setting(key, None)
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None
    return _f("bed_treasury_bed"), _f("bed_treasury_ton"), (storage.get_setting("bed_treasury_addr", "") or "")
