from dataclasses import dataclass

from config import SLOTS_PAYOUTS

# Telegram's native send_dice(emoji='🎰') returns a value 1-64. Internally it
# represents 3 reels of 4 symbols each (bar=0, grapes=1, lemon=2, seven=3):
#   index = value - 1
#   reel1, reel2, reel3 = index % 4, (index // 4) % 4, (index // 16) % 4
# A "win" is any combo where all three reels match (4 of 64 outcomes).
SYMBOLS = ["🍫", "🍇", "🍋", "7️⃣"]  # bar, grapes, lemon, seven


@dataclass
class SlotsResult:
    reels: tuple[str, str, str]
    won: bool
    payout: int
    multiplier: float


def resolve(bet: int, value: int) -> SlotsResult:
    index = value - 1
    r1, r2, r3 = index % 4, (index // 4) % 4, (index // 16) % 4
    reels = (SYMBOLS[r1], SYMBOLS[r2], SYMBOLS[r3])

    won = r1 == r2 == r3
    multiplier = SLOTS_PAYOUTS[r1] if won else 0.0
    payout = int(bet * multiplier) if won else 0
    return SlotsResult(reels=reels, won=won, payout=payout, multiplier=multiplier)
