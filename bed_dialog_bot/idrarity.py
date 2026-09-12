"""🆔 Player-ID rarity engine.

Pure, side-effect-free classification of a player ID (a short string of
letters/digits) into a *rarity tier* — the thing that makes one ID a flex and
another a nobody. Everything here is anonymous: it talks about the ID, never
about who holds it.

Design note: numbers *dominated by a single digit* (e.g. 11115111, 3330333)
are deliberately treated as trash — a clean repdigit (7777) is cool, but a
near-repdigit with one odd digit out is not. Real coolness comes from
structure: repeats, mirrors, ladders, progressions, binary, block patterns,
clean rounds and short punchy numbers.
"""

from __future__ import annotations

# Hand-picked legends — the IDs everyone secretly wants.
_LEGENDARY = {
    "0", "1", "7", "8", "69", "100", "228", "322", "420",
    "666", "777", "888", "999", "1000", "1337", "1234", "4321",
    "7777", "8888", "9999", "10000", "100000", "1000000", "10000000",
    "100000000", "12345", "54321", "123456", "654321", "1234567",
    "7654321", "12345678", "87654321", "123456789", "80085", "1234321",
}

_TIER_INFO = {
    # tier:     (emoji, human name, appraisal multiplier over the buy cost)
    "legendary": ("👑", "Легендарный", 35),
    "repeat":    ("🎰", "Повторы", 16),
    "binary":    ("🤖", "Бинарный", 15),
    "pattern":   ("🎭", "Узор", 12),
    "mirror":    ("🪞", "Зеркальный", 11),
    "ladder":    ("📈", "Лесенка", 11),
    "step":      ("🚀", "Прогрессия", 10),
    "pair":      ("👯", "Пары", 8),
    "round":     ("⭕", "Круглый", 7),
    "angel":     ("😇", "Ангельский", 8),
    "double":    ("💫", "Двойной", 5),
    "vanity":    ("🔤", "Именной", 9),
    "common":    ("⚪", "Обычный", 1),
}

_TIER_SCORE = {
    "legendary": 100, "repeat": 92, "binary": 90, "pattern": 86, "mirror": 84,
    "ladder": 82, "step": 80, "pair": 74, "round": 66, "angel": 72,
    "double": 60, "vanity": 64, "common": 12,
}


def _is_ladder(s: str) -> bool:
    """Consecutive run, step ±1 (1234, 4321)."""
    if len(s) < 3:
        return False
    diffs = {int(s[i + 1]) - int(s[i]) for i in range(len(s) - 1)}
    return diffs == {1} or diffs == {-1}


def _is_step(s: str) -> bool:
    """Arithmetic progression with step ±2 or ±3 (2468, 1357, 9630)."""
    if len(s) < 3:
        return False
    diffs = {int(s[i + 1]) - int(s[i]) for i in range(len(s) - 1)}
    return len(diffs) == 1 and next(iter(diffs)) in (2, -2, 3, -3)


def _is_block_repeat(s: str) -> bool:
    """A repeated block of length ≥2 (1212, 123123, 696969)."""
    n = len(s)
    if n < 4:
        return False
    for b in range(2, n // 2 + 1):
        if n % b == 0 and s[:b] * (n // b) == s and len(set(s[:b])) > 1:
            return True
    return False


def _dominated(s: str) -> bool:
    """One digit makes up >60% of a 4+ digit number → trash (near-repdigit)."""
    n = len(s)
    if n < 4:
        return False
    top = max(set(s), key=s.count)
    return s.count(top) / n > 0.6


def tier(pid) -> str:
    """Return the rarity-tier key for a player ID."""
    s = str(pid).lower()
    if not s:
        return "common"
    if not s.isdigit():                       # letters → a named/vanity handle
        return "vanity"
    if s in _LEGENDARY:
        return "legendary"
    n = len(s)
    uniq = set(s)
    if n >= 3 and len(uniq) == 1:
        return "repeat"                       # 777, 5555, 88888
    if n == 2 and len(uniq) == 1:
        return "double"                       # 77, 22
    # clean round (one leading digit then only zeros) — checked before the
    # "dominated" trash filter so 5000000 stays cool, not garbage.
    if n >= 3 and len(uniq) > 1 and set(s[1:]) == {"0"}:
        return "round"                        # 5000, 70000, 3000000
    if n >= 3 and uniq <= {"0", "1"} and not _dominated(s):
        return "binary"                       # 1010, 1001, 10110 (no leading 0)
    if _is_block_repeat(s):
        return "pattern"                      # 1212, 123123, 696969
    if _is_ladder(s):
        return "ladder"                       # 1234, 4321
    if _is_step(s):
        return "step"                         # 2468, 1357, 9630
    if n == 4 and s[0] == s[1] and s[2] == s[3] and s[0] != s[2]:
        return "pair"                         # 1122, 7788
    # near-repdigit / single-digit-dominated numbers are TRASH — bail to common
    if _dominated(s):
        return "common"
    if n >= 3 and s == s[::-1]:
        return "mirror"                       # 12321, 4554 (with variety)
    if int(s) <= 100:
        return "angel"                        # 0..100 — short & memorable
    return "common"


def classify(pid) -> dict:
    """Full rarity descriptor: {tier, emoji, name, score}."""
    t = tier(pid)
    emoji, name, _mult = _TIER_INFO[t]
    score = _TIER_SCORE[t]
    s = str(pid)
    if s.isdigit() and len(s) <= 4:           # short numeric handles are cooler
        score = min(100, score + (5 - len(s)) * 4)
    return {"tier": t, "emoji": emoji, "name": name, "score": score}


def badge(pid) -> str:
    return _TIER_INFO[tier(pid)][0]


def label(pid) -> str:
    info = _TIER_INFO[tier(pid)]
    return f"{info[0]} {info[1]}"


def appraise(pid, base_cost: int = 10) -> int:
    """Suggested market value in BED (advisory only — never minted)."""
    t = tier(pid)
    mult = _TIER_INFO[t][2]
    value = base_cost * mult
    s = str(pid)
    if s.isdigit() and len(s) <= 4:           # short numbers command a premium
        value += base_cost * (5 - len(s)) * 2
    return max(3, int(value))


# --- 🏅 Collections / sets --------------------------------------------------
# Aspirational sets: hold every member to complete one. Purely a cosmetic
# flex + a goal that makes whales chase specific handles. No BED reward.
SETS = [
    ("angels", "😇 Первая десятка", ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]),
    ("lucky", "🍀 Фартовый", ["7", "77", "777", "7777"]),
    ("dragon", "🐉 Драконий", ["8", "88", "888", "8888"]),
    ("devil", "😈 Дьявольский набор", ["6", "66", "666"]),
    ("jackpot", "💰 Джекпот", ["777", "888", "999"]),
    ("stairs", "📈 Лестница", ["123", "1234", "12345"]),
    ("descent", "🪜 Спуск", ["321", "4321", "54321"]),
    ("mirrors", "🪞 Зеркала", ["121", "1221", "12321"]),
    ("mirrors_pro", "🪞 Зеркала PRO", ["12321", "123321", "1234321"]),
    ("binary", "🤖 Бинарный код", ["10", "101", "1010", "10101"]),
    ("pairs", "👯 Парочки", ["1122", "3344", "5566"]),
    ("progression", "🚀 Прогрессия", ["1357", "2468", "13579"]),
    ("zeros", "⭕ Повелитель нулей", ["100", "1000", "10000", "100000"]),
    ("emperor", "👑 Императорский", ["1", "100", "10000", "1000000"]),
    ("millions", "💠 Миллионы", ["1000000", "10000000", "100000000"]),
]


def set_progress(owned) -> list:
    """For each set, how many members the holder owns."""
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
