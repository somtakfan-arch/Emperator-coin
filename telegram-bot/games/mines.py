import secrets
from dataclasses import dataclass, field
from math import comb

from config import MINES_MAX_MULTIPLIER, MINES_RTP


def multiplier(size: int, mines: int, opened: int) -> float:
    """Payout multiplier after `opened` safe picks.

    Surviving k picks on an N-cell field with M mines has probability
    C(N-M, k) / C(N, k), so fair odds are the inverse; MINES_RTP is the
    house's cut on top of that, and the result is capped at
    MINES_MAX_MULTIPLIER.
    """
    if opened <= 0:
        return 0.0
    total = size * size
    safe = total - mines
    raw = MINES_RTP * comb(total, opened) / comb(safe, opened)
    return min(raw, MINES_MAX_MULTIPLIER)


@dataclass
class MinesGame:
    size: int
    mines: int
    bet: int
    mine_cells: set[int]
    opened: list[int] = field(default_factory=list)
    busted: bool = False
    cashed_out: bool = False

    @property
    def total(self) -> int:
        return self.size * self.size

    @property
    def safe_total(self) -> int:
        return self.total - self.mines

    @property
    def finished(self) -> bool:
        return self.busted or self.cashed_out

    @property
    def cleared(self) -> bool:
        return len(self.opened) >= self.safe_total

    def current_multiplier(self) -> float:
        return multiplier(self.size, self.mines, len(self.opened))

    def next_multiplier(self) -> float:
        return multiplier(self.size, self.mines, len(self.opened) + 1)

    def payout(self) -> int:
        return int(self.bet * self.current_multiplier())

    def open_cell(self, index: int) -> bool:
        """Open a cell. Returns True if it was safe, False if it was a mine."""
        if index in self.opened or self.finished:
            return not self.busted
        if index in self.mine_cells:
            self.busted = True
            return False
        self.opened.append(index)
        if self.cleared:
            self.cashed_out = True
        return True


def new_game(size: int, mines: int, bet: int) -> MinesGame:
    total = size * size
    if not 1 <= mines < total:
        raise ValueError(f"{mines} mines does not fit a {size}x{size} field")
    cells = secrets.SystemRandom().sample(range(total), mines)
    return MinesGame(size=size, mines=mines, bet=bet, mine_cells=set(cells))
