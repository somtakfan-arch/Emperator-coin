import secrets
from dataclasses import dataclass, field

RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]
SUITS = ["♠️", "♥️", "♦️", "♣️"]


def new_shoe() -> list[str]:
    deck = [f"{rank}{suit}" for rank in RANKS for suit in SUITS] * 4  # 4-deck shoe
    shuffled = deck[:]
    secrets.SystemRandom().shuffle(shuffled)
    return shuffled


def card_value(card: str) -> int:
    # card strings look like "10♠️" (rank + suit emoji); match the longest rank first
    # so "10" isn't mistaken for "1".
    rank = next(r for r in sorted(RANKS, key=len, reverse=True) if card.startswith(r))
    if rank == "A":
        return 11
    if rank in ("J", "Q", "K"):
        return 10
    return int(rank)


def hand_value(hand: list[str]) -> int:
    total = sum(card_value(c) for c in hand)
    aces = sum(1 for c in hand if c.startswith("A"))
    while total > 21 and aces:
        total -= 10
        aces -= 1
    return total


def is_blackjack(hand: list[str]) -> bool:
    return len(hand) == 2 and hand_value(hand) == 21


@dataclass
class BlackjackGame:
    shoe: list[str] = field(default_factory=new_shoe)
    player: list[str] = field(default_factory=list)
    dealer: list[str] = field(default_factory=list)
    bet: int = 0
    finished: bool = False

    def deal(self) -> None:
        self.player = [self.draw(), self.draw()]
        self.dealer = [self.draw(), self.draw()]

    def draw(self) -> str:
        if not self.shoe:
            self.shoe = new_shoe()
        return self.shoe.pop()

    def player_hit(self) -> None:
        self.player.append(self.draw())

    def player_value(self) -> int:
        return hand_value(self.player)

    def dealer_value(self) -> int:
        return hand_value(self.dealer)

    def dealer_play(self) -> None:
        while hand_value(self.dealer) < 17:
            self.dealer.append(self.draw())

    def outcome(self) -> tuple[str, float]:
        """Returns (result, payout_multiplier). result in {win, lose, push, blackjack}."""
        player_total = self.player_value()
        dealer_total = self.dealer_value()

        if player_total > 21:
            return "lose", 0.0
        if is_blackjack(self.player) and not is_blackjack(self.dealer):
            return "blackjack", 2.5
        if dealer_total > 21:
            return "win", 2.0
        if player_total > dealer_total:
            return "win", 2.0
        if player_total == dealer_total:
            return "push", 1.0
        return "lose", 0.0
