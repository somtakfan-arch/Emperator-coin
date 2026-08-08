import secrets
from dataclasses import dataclass

RED_NUMBERS = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}

MULTIPLIERS = {
    "red": 2.0,
    "black": 2.0,
    "even": 2.0,
    "odd": 2.0,
    "low": 2.0,  # 1-18
    "high": 2.0,  # 19-36
    "zero": 35.0,  # straight-up bet on 0
}


@dataclass
class RouletteResult:
    number: int
    color: str
    won: bool
    payout: int
    multiplier: float


def _color(number: int) -> str:
    if number == 0:
        return "green"
    return "red" if number in RED_NUMBERS else "black"


def spin() -> int:
    return secrets.randbelow(37)  # European wheel: 0-36


def resolve(bet: int, bet_type: str, number: int) -> RouletteResult:
    color = _color(number)
    won = False

    if bet_type == "zero":
        won = number == 0
    elif number == 0:
        won = False  # house number: all outside bets lose on 0
    elif bet_type == "red":
        won = color == "red"
    elif bet_type == "black":
        won = color == "black"
    elif bet_type == "even":
        won = number % 2 == 0
    elif bet_type == "odd":
        won = number % 2 == 1
    elif bet_type == "low":
        won = 1 <= number <= 18
    elif bet_type == "high":
        won = 19 <= number <= 36
    else:
        raise ValueError(f"Unknown roulette bet type: {bet_type}")

    multiplier = MULTIPLIERS[bet_type]
    payout = int(bet * multiplier) if won else 0
    return RouletteResult(number=number, color=color, won=won, payout=payout, multiplier=multiplier)
