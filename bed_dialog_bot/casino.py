"""Casino game logic (pure functions + tiny in-memory helpers).

Every game keeps a small positive house edge so BED can't be farmed. Interactive
games (mines, blackjack) store per-user state in Application.bot_data["casino"].
"""
import random

# --- 🎰 Slots (native Telegram 🎰 dice, value 1..64) ------------------------
# value-1 in base 4 gives the three reels; symbol 3 == "seven".
# All-same is a triple; all-seven (value 64) is the jackpot.
SLOT_TRIPLE_MULT = 10
SLOT_JACKPOT_MULT = 30  # triple seven (value 64)


def slots_multiplier(value: int) -> int:
    v = value - 1
    r1, r2, r3 = v % 4, (v // 4) % 4, (v // 16) % 4
    if r1 == r2 == r3:
        return SLOT_JACKPOT_MULT if r1 == 3 else SLOT_TRIPLE_MULT
    return 0


def slots_symbols(value: int) -> str:
    icons = ["🍫", "🍇", "🍋", "7️⃣"]
    v = value - 1
    return " ".join(icons[(v // p) % 4] for p in (1, 4, 16))


# --- 🎯 Darts (native 🎯 dice, value 1..6; 6 == bullseye) -------------------
DARTS_BULLSEYE_MULT = 5


# --- 🔴⚫️ Roulette (European single zero) ----------------------------------
_RED = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}


def roulette_spin() -> int:
    return random.randint(0, 36)


def roulette_color(n: int) -> str:
    if n == 0:
        return "green"
    return "red" if n in _RED else "black"


def roulette_payout(bet_type: str, n: int):
    """Return the TOTAL returned per 1 BED staked (0 = loss). Single-zero gives
    the house its edge automatically."""
    color = roulette_color(n)
    if bet_type in ("red", "black"):
        return 2 if color == bet_type else 0
    if bet_type == "even":
        return 2 if (n != 0 and n % 2 == 0) else 0
    if bet_type == "odd":
        return 2 if (n % 2 == 1) else 0
    if bet_type.isdigit():
        return 36 if int(bet_type) == n else 0
    return 0


# --- 📈 Crash --------------------------------------------------------------
CRASH_EDGE = 0.03  # 3% house edge


def roll_crash() -> float:
    """Crash multiplier. P(crash >= x) = (1-edge)/x → constant edge at any
    cash-out target. Min 1.00."""
    r = random.random()
    if r < CRASH_EDGE:
        return 1.00
    point = (1.0 - CRASH_EDGE) / (1.0 - r)
    return max(1.0, round(point, 2))


# --- 💣 Mines --------------------------------------------------------------
import os as _os
MINES_TILES = 25
# House edge on mines. Bumped hard (was 0.05) — cashout multipliers are lower,
# so players must reveal more tiles to profit and bust far more often.
MINES_EDGE = float(_os.environ.get("MINES_EDGE", "0.20"))


def mines_new(bombs: int):
    bombs = max(1, min(24, bombs))
    positions = set(random.sample(range(MINES_TILES), bombs))
    return positions


def mines_multiplier(picks: int, bombs: int) -> float:
    """Fair multiplier after `picks` safe reveals, times (1-edge)."""
    m = 1.0
    safe = MINES_TILES - bombs
    for i in range(picks):
        m *= (MINES_TILES - i) / (safe - i)
    return m * (1 - MINES_EDGE)


# --- 🃏 Blackjack ----------------------------------------------------------
def bj_draw() -> int:
    """Infinite-deck card value: ace=11, J/Q/K/10=10, else pip 2..9."""
    c = random.randint(1, 13)
    if c == 1:
        return 11
    if c >= 10:
        return 10
    return c


def bj_total(cards):
    total = sum(cards)
    aces = cards.count(11)
    while total > 21 and aces:
        total -= 10
        aces -= 1
    return total


def bj_dealer_play(cards):
    while bj_total(cards) < 17:
        cards.append(bj_draw())
    return cards
