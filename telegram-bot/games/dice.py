from dataclasses import dataclass

from config import (
    DICE_EXTREME_MULTIPLIER,
    DICE_NUMBER_MULTIPLIER,
    DICE_PARITY_MULTIPLIER,
)


@dataclass
class DiceResult:
    won: bool
    payout: int
    multiplier: float


def resolve(bet: int, bet_type: str, value: int, guess: int | None = None) -> DiceResult:
    """value: the 1-6 result of Telegram's native send_dice(emoji='🎲')."""
    won = False
    multiplier = 0.0

    if bet_type == "number":
        won = guess == value
        multiplier = DICE_NUMBER_MULTIPLIER
    elif bet_type == "high":
        # only 5 and 6 win — 3 and 4 go to the house
        won = value >= 5
        multiplier = DICE_EXTREME_MULTIPLIER
    elif bet_type == "low":
        won = value <= 2
        multiplier = DICE_EXTREME_MULTIPLIER
    elif bet_type == "even":
        won = value % 2 == 0
        multiplier = DICE_PARITY_MULTIPLIER
    elif bet_type == "odd":
        won = value % 2 == 1
        multiplier = DICE_PARITY_MULTIPLIER
    else:
        raise ValueError(f"Unknown dice bet type: {bet_type}")

    payout = int(bet * multiplier) if won else 0
    return DiceResult(won=won, payout=payout, multiplier=multiplier)
