from dataclasses import dataclass

NUMBER_MULTIPLIER = 5.0  # true fair odds would be x6 (1/6 chance) -> house edge
EVEN_ODD_MULTIPLIER = 1.9
HIGH_LOW_MULTIPLIER = 1.9


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
        multiplier = NUMBER_MULTIPLIER
    elif bet_type == "high":
        won = value >= 4
        multiplier = HIGH_LOW_MULTIPLIER
    elif bet_type == "low":
        won = value <= 3
        multiplier = HIGH_LOW_MULTIPLIER
    elif bet_type == "even":
        won = value % 2 == 0
        multiplier = EVEN_ODD_MULTIPLIER
    elif bet_type == "odd":
        won = value % 2 == 1
        multiplier = EVEN_ODD_MULTIPLIER
    else:
        raise ValueError(f"Unknown dice bet type: {bet_type}")

    payout = int(bet * multiplier) if won else 0
    return DiceResult(won=won, payout=payout, multiplier=multiplier)
