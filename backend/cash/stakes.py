"""What a cash table costs to sit at.

A tournament is a night with an entry fee; a cash table is a room you walk into
with money and walk out of with whatever you have left. The whole difference is
here: the chips in front of you are coins, exactly, and every one of them is
yours to take away between hands.

Stakes are a small fixed ladder rather than a free choice. Not because anything
technical stops a 37/74 table, but because a lobby of one-off stakes is a lobby
where nobody meets anybody: a handful of rooms everybody knows the names of is
what makes a table fill. Clubs can open tables at these same stakes, which is
what keeps a club night and the public tables the same game.

Everything here is arithmetic and constants, and it is the part worth pinning:
the buy-in limits are the difference between a table people can sit at and a
table one player owns.
"""

from dataclasses import dataclass
from typing import Tuple


@dataclass(frozen=True)
class Stake:
    """One rung of the ladder, in coins."""

    key: str
    small_blind: int
    big_blind: int

    @property
    def label(self) -> str:
        return f"{self.small_blind}/{self.big_blind}"

    @property
    def min_buy_in(self) -> int:
        """Twenty big blinds. Short enough to be a real choice, deep enough
        that one hand is not the whole visit."""
        return self.big_blind * MIN_BUY_IN_BB

    @property
    def max_buy_in(self) -> int:
        """A hundred big blinds, which is what "deep" means everywhere else in
        poker and what stops one wallet owning the table."""
        return self.big_blind * MAX_BUY_IN_BB


MIN_BUY_IN_BB = 20
MAX_BUY_IN_BB = 100

# The ladder. Doubling each rung, so the gap between two of them is always the
# same decision — and small enough at the bottom that the daily coins are a
# session rather than a single hand.
STAKES = (
    Stake("micro", 1, 2),
    Stake("low", 2, 5),
    Stake("mid", 5, 10),
    Stake("high", 10, 25),
    Stake("nose", 25, 50),
)

BY_KEY = {one.key: one for one in STAKES}

# How many can sit at one. Six is the shape most cash games are actually
# played in; the other two are there because a heads-up table and a full ring
# are different games rather than different sizes.
SEAT_CHOICES = (2, 6, 9)
DEFAULT_SEATS = 6


def stake_for(key):
    """The rung with this key, or None."""
    return BY_KEY.get(str(key or "").strip().lower())


def clean_seats(value) -> int:
    """A seat count we actually deal for."""
    try:
        seats = int(value)
    except (TypeError, ValueError):
        return DEFAULT_SEATS
    return seats if seats in SEAT_CHOICES else DEFAULT_SEATS


def buy_in_range(stake) -> Tuple[int, int]:
    """The least and most somebody may bring, in coins."""
    return stake.min_buy_in, stake.max_buy_in


def clean_buy_in(stake, amount, wallet_balance=None):
    """What this player is actually buying in for, or a string saying why not.

    Held between the two limits rather than rounded into them: somebody who
    asks for less than the minimum has misread the table, and quietly taking
    more of their coins than they typed is not a fix for that.
    """
    try:
        coins = int(amount)
    except (TypeError, ValueError):
        return "That is not an amount."

    low, high = buy_in_range(stake)
    if coins < low:
        return f"The least you can sit down with here is {low}."
    if coins > high:
        return f"The most you can sit down with here is {high}."
    if wallet_balance is not None and coins > wallet_balance:
        return "Not enough coins."
    return coins


def top_up_room(stake, stack) -> int:
    """How much more this player may bring to a stack they already have.

    Up to the table maximum and no further, which is the rule that stops
    somebody reloading their way past everybody else between hands. Zero when
    they are already at or above it — a stack that grew past the cap by winning
    is theirs to keep, it just cannot be added to.
    """
    return max(0, stake.max_buy_in - max(0, stack))
