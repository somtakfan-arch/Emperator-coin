"""🎴 NFT-style collectibles: catalog, rarities and pack/case definitions.

Pure data + helpers, no DB. Each collectible is minted from a *template* and
gets a unique serial number (NFT feel: "#7/100"). Rarity drives drop weight
and market value. Some templates are limited (max_supply) and/or seasonal
(only mintable while the drop window is open).
"""

from __future__ import annotations

import random

# rarity: (key, human name, emoji, drop weight, value multiplier over pack cost)
RARITIES = [
    ("common",    "Обычная",     "⚪", 550, 1),
    ("rare",      "Редкая",      "🔵", 280, 3),
    ("epic",      "Эпическая",   "🟣", 120, 8),
    ("legendary", "Легендарная", "🟠", 45, 25),
    ("mythic",    "Мифическая",  "🔴", 5, 90),
]
RARITY_INFO = {r[0]: r for r in RARITIES}
RARITY_ORDER = [r[0] for r in RARITIES]


def rarity_emoji(r: str) -> str:
    return RARITY_INFO.get(r, RARITIES[0])[2]


def rarity_name(r: str) -> str:
    return RARITY_INFO.get(r, RARITIES[0])[1]


def rarity_next(r: str):
    i = RARITY_ORDER.index(r) if r in RARITY_ORDER else 0
    return RARITY_ORDER[i + 1] if i + 1 < len(RARITY_ORDER) else None


# --- Catalog ---------------------------------------------------------------
# tid, name, series, rarity, emoji, kind, season, max_supply
# kind: "card" | "pet" | "coin"; season: 0 = evergreen, N = seasonal drop;
# max_supply: 0 = unlimited.
def _c(tid, name, series, rarity, emoji, kind="card", season=0, supply=0):
    return {"tid": tid, "name": name, "series": series, "rarity": rarity,
            "emoji": emoji, "kind": kind, "season": season, "max_supply": supply}


CATALOG = [
    # 👑 Императоры BED
    _c("emp_pawn", "Пешка", "Императоры BED", "common", "♟"),
    _c("emp_knight", "Рыцарь", "Императоры BED", "common", "🐴"),
    _c("emp_bishop", "Советник", "Императоры BED", "rare", "🎩"),
    _c("emp_queen", "Королева", "Императоры BED", "epic", "👸"),
    _c("emp_king", "Король BED", "Императоры BED", "legendary", "🤴"),
    _c("emp_emperor", "ИМПЕРАТОР", "Императоры BED", "mythic", "👑"),
    # 🎰 Казино
    _c("cas_chip", "Фишка", "Казино", "common", "🔴"),
    _c("cas_dice", "Кости", "Казино", "common", "🎲"),
    _c("cas_card", "Туз", "Казино", "rare", "🃏"),
    _c("cas_wheel", "Колесо", "Казино", "epic", "🎡"),
    _c("cas_777", "Джекпот 777", "Казино", "legendary", "🎰"),
    _c("cas_crash", "Крах-ракета", "Казино", "mythic", "🚀"),
    # 💎 TON-лор
    _c("ton_drop", "Капля TON", "TON-лор", "common", "💧"),
    _c("ton_jetton", "Джеттон", "TON-лор", "rare", "🪙"),
    _c("ton_validator", "Валидатор", "TON-лор", "epic", "🖥"),
    _c("ton_whale", "Кит TON", "TON-лор", "legendary", "🐋"),
    _c("ton_diamond", "Алмаз TON", "TON-лор", "mythic", "💎"),
    # 😹 Мемы бота
    _c("meme_bedcat", "BedCat", "Мемы", "common", "🐱"),
    _c("meme_troll", "Тролль", "Мемы", "rare", "🧌"),
    _c("meme_boom", "Бум", "Мемы", "epic", "💥"),
    _c("meme_ghost", "Призрак-бан", "Мемы", "legendary", "👻"),
    # 🐾 Питомцы (kind=pet)
    _c("pet_bedcat", "Котёнок BedCat", "Питомцы", "rare", "🐱", kind="pet"),
    _c("pet_crab", "Мин-краб", "Питомцы", "rare", "🦀", kind="pet"),
    _c("pet_dragon", "TON-дракончик", "Питомцы", "epic", "🐉", kind="pet"),
    _c("pet_phoenix", "Феникс", "Питомцы", "legendary", "🔥", kind="pet"),
    # Evolutions (reached via feeding — not directly minted; supply -1 marks hidden)
    _c("pet_bedcat2", "Кот BedCat", "Питомцы", "epic", "😼", kind="pet", supply=-1),
    _c("pet_crab2", "Кракен-краб", "Питомцы", "epic", "🦞", kind="pet", supply=-1),
    _c("pet_dragon2", "TON-дракон", "Питомцы", "legendary", "🐲", kind="pet", supply=-1),
    _c("pet_phoenix2", "Вечный Феникс", "Питомцы", "mythic", "☄️", kind="pet", supply=-1),
    # 🪙 Сезон 1 — лимитные (max_supply)
    _c("s1_coin", "Монета Сезона 1", "Сезон 1", "epic", "🪙", kind="coin", season=1, supply=500),
    _c("s1_medal", "Медаль Сезона 1", "Сезон 1", "legendary", "🎖", kind="coin", season=1, supply=150),
    _c("s1_crown", "Корона Сезона 1", "Сезон 1", "mythic", "👑", kind="coin", season=1, supply=25),
]
CATALOG_BY_ID = {t["tid"]: t for t in CATALOG}

# pet evolutions: base tid -> (evolved tid, level required)
PET_EVOLVE = {
    "pet_bedcat": ("pet_bedcat2", 5),
    "pet_crab": ("pet_crab2", 5),
    "pet_dragon": ("pet_dragon2", 7),
    "pet_phoenix": ("pet_phoenix2", 10),
}

SERIES = ["Императоры BED", "Казино", "TON-лор", "Мемы", "Питомцы", "Сезон 1"]

# --- Packs / cases ---------------------------------------------------------
# key, title, emoji, cost(BED), count, pool(list of series or "base"), weight bias
# "base" = all evergreen non-pet, non-season templates.
PACKS = [
    {"key": "basic", "title": "Обычный пак", "emoji": "📦", "cost": 15, "count": 3,
     "pool": "base", "bias": {}},
    {"key": "premium", "title": "Премиум-кейс", "emoji": "🎁", "cost": 45, "count": 3,
     "pool": "base", "bias": {"epic": 2.0, "legendary": 3.0, "mythic": 4.0}},
    {"key": "pets", "title": "Кейс питомцев", "emoji": "🐾", "cost": 60, "count": 1,
     "pool": "Питомцы", "bias": {}},
    {"key": "season1", "title": "Сезонный кейс №1", "emoji": "🪙", "cost": 40, "count": 1,
     "pool": "Сезон 1", "bias": {}},
]
PACKS_BY_KEY = {p["key"]: p for p in PACKS}

DAILY_CASE = {"key": "daily", "title": "Ежедневный кейс", "emoji": "🎟", "count": 1,
              "pool": "base", "bias": {}}


def pool_templates(pool: str):
    """Templates eligible for a pack pool (evolutions excluded)."""
    if pool == "base":
        return [t for t in CATALOG if t["kind"] == "card" and t["season"] == 0 and t["max_supply"] >= 0]
    return [t for t in CATALOG if t["series"] == pool and t["max_supply"] >= 0]


def roll_template(pool: str, bias: dict, minted_counts: dict, rng: random.Random = random):
    """Weighted pick of a template from a pool, honoring bias and skipping
    sold-out limited templates. `minted_counts` maps tid->already minted.
    Returns a template dict or None if the pool is exhausted."""
    cands = []
    weights = []
    for t in pool_templates(pool):
        if t["max_supply"] > 0 and minted_counts.get(t["tid"], 0) >= t["max_supply"]:
            continue  # sold out
        w = RARITY_INFO[t["rarity"]][3] * bias.get(t["rarity"], 1.0)
        if w <= 0:
            continue
        cands.append(t)
        weights.append(w)
    if not cands:
        return None
    return rng.choices(cands, weights=weights, k=1)[0]


def value_of(rarity: str, base_cost: int = 15) -> int:
    """Advisory market value of a collectible by rarity."""
    return max(2, base_cost * RARITY_INFO.get(rarity, RARITIES[0])[4] // 3)
