import secrets
from dataclasses import dataclass

from config import COINFLIP_EDGE_CHANCE, COINFLIP_MULTIPLIER


@dataclass
class CoinflipResult:
    outcome: str  # "heads", "tails" or "edge"
    won: bool
    payout: int


def play(bet: int, choice: str) -> CoinflipResult:
    # The coin can land on its edge, in which case both sides lose. This is the
    # house edge made literal, and it is spelled out in the game menu.
    if secrets.randbelow(10_000) < COINFLIP_EDGE_CHANCE * 10_000:
        return CoinflipResult(outcome="edge", won=False, payout=0)

    outcome = secrets.choice(["heads", "tails"])
    won = outcome == choice
    payout = int(bet * COINFLIP_MULTIPLIER) if won else 0
    return CoinflipResult(outcome=outcome, won=won, payout=payout)
