import secrets
from dataclasses import dataclass

PAYOUT_MULTIPLIER = 1.9  # ~5% house edge on a fair 50/50 game


@dataclass
class CoinflipResult:
    outcome: str  # "heads" or "tails"
    won: bool
    payout: int


def play(bet: int, choice: str) -> CoinflipResult:
    outcome = secrets.choice(["heads", "tails"])
    won = outcome == choice
    payout = int(bet * PAYOUT_MULTIPLIER) if won else 0
    return CoinflipResult(outcome=outcome, won=won, payout=payout)
