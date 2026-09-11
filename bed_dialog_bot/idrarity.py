"""🆔 Player-ID rarity engine.

Pure, side-effect-free classification of a player ID (a short string of
letters/digits) into a *rarity tier* — the thing that makes one ID a flex and
another a nobody. Everything here is anonymous: it talks about the ID, never
about who holds it.

Tiers (rarest first): legendary 👑, repeat 🎰, mirror 🪞, ladder 📈,
almost 🎲, round ⭕, angel 😇, double 💫, vanity 🔤, common ⚪.
"""

from __future__ import annotations

# A handful of hand-picked legends — the IDs everyone secretly wants.
_LEGENDARY = {
    "0", "1", "7", "8", "69", "100", "228", "322", "420",
    "666", "777", "888", "999", "1000", "1337", "1234", "4321",
    "10000", "100000", "1000000", "12345", "54321", "12321", "80085",
    "123456", "654321", "1234567", "7654321",
}

_TIER_INFO = {
    # tier:     (emoji, human name, appraisal multiplier over the buy cost)
    "legendary": ("👑", "Легендарный", 25),
    "repeat":    ("🎰", "Повторы", 12),
    "mirror":    ("🪞", "Зеркальный", 10),
    "ladder":    ("📈", "Лесенка", 8),
    "almost":    ("🎲", "Почти повтор", 6),
    "round":     ("⭕", "Круглый", 5),
    "angel":     ("😇", "Ангельский", 6),
    "double":    ("💫", "Двойной", 4),
    "vanity":    ("🔤", "Именной", 7),
    "common":    ("⚪", "Обычный", 1),
}

_TIER_SCORE = {
    "legendary": 100, "repeat": 90, "mirror": 82, "ladder": 78,
    "almost": 66, "round": 60, "angel": 64, "double": 72, "vanity": 60,
    "common": 20,
}


def _is_ladder(s: str) -> bool:
    if len(s) < 3 or not s.isdigit():
        return False
    diffs = {int(s[i + 1]) - int(s[i]) for i in range(len(s) - 1)}
    return diffs == {1} or diffs == {-1}


def tier(pid) -> str:
    """Return the rarity-tier key for a player ID."""
    s = str(pid).lower()
    if not s:
        return "common"
    if not s.isdigit():          # contains letters → a named/vanity handle
        return "vanity"
    if s in _LEGENDARY:
        return "legendary"
    uniq = set(s)
    if len(s) >= 3 and len(uniq) == 1:
        return "repeat"                       # 777, 5555, 88888
    if len(s) == 2 and len(uniq) == 1:
        return "double"                       # 77, 22
    if len(s) >= 3 and s == s[::-1]:
        return "mirror"                       # 12321, 4554
    if _is_ladder(s):
        return "ladder"                       # 1234, 4321
    if len(s) >= 3:
        # all-but-one digit identical → near-repdigit (7787, 55556)
        top = max(uniq, key=s.count)
        if s.count(top) == len(s) - 1:
            return "almost"
    val = int(s)
    if val > 0 and val % 1000 == 0:
        return "round"                        # 1000, 50000
    if val <= 100:
        return "angel"                        # 0..100 — short & memorable
    return "common"


def classify(pid) -> dict:
    """Full rarity descriptor: {tier, emoji, name, score}."""
    t = tier(pid)
    emoji, name, _mult = _TIER_INFO[t]
    score = _TIER_SCORE[t]
    s = str(pid)
    # shorter numeric handles are inherently cooler — nudge the score up
    if s.isdigit() and len(s) <= 4:
        score = min(100, score + (5 - len(s)) * 4)
    return {"tier": t, "emoji": emoji, "name": name, "score": score}


def badge(pid) -> str:
    """Just the emoji, for inline lists."""
    return _TIER_INFO[tier(pid)][0]


def label(pid) -> str:
    """'👑 Легендарный' — emoji + tier name."""
    info = _TIER_INFO[tier(pid)]
    return f"{info[0]} {info[1]}"


def appraise(pid, base_cost: int = 10) -> int:
    """Suggested market value in BED (advisory only — never minted).

    Driven by the rarity tier, with a bonus for very short numeric handles.
    """
    t = tier(pid)
    mult = _TIER_INFO[t][2]
    value = base_cost * mult
    s = str(pid)
    if s.isdigit() and len(s) <= 4:          # short numbers command a premium
        value += base_cost * (5 - len(s))
    return max(3, int(value))


# --- 🏅 Collections / sets --------------------------------------------------
# Aspirational sets: hold every member to complete one. Purely a cosmetic
# flex + a goal that makes whales chase specific handles. No BED reward.
SETS = [
    ("angels", "😇 Первая десятка", ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]),
    ("triple7", "🎰 Тройная семёрка", ["7", "77", "777"]),
    ("devil", "😈 Дьявольский набор", ["6", "66", "666"]),
    ("jackpot", "💰 Джекпот", ["777", "888", "999"]),
    ("stairs", "📈 Лестница", ["123", "1234", "12345"]),
    ("mirrors", "🪞 Зеркала", ["121", "1221", "12321"]),
    ("rounds", "⭕ Круглый счёт", ["1000", "10000", "100000"]),
]


def set_progress(owned) -> list:
    """For each set, how many members the holder owns. Returns a list of
    {key, title, have, total, done, missing}."""
    owned = {str(x) for x in owned}
    out = []
    for key, title, members in SETS:
        have = [m for m in members if m in owned]
        out.append({
            "key": key, "title": title,
            "have": len(have), "total": len(members),
            "done": len(have) == len(members),
            "missing": [m for m in members if m not in owned],
        })
    return out
