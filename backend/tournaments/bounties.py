"""Knockout bounty arithmetic.

Two modes, both funded out of the buy-in rather than charged on top of it:

* **fixed** — every head is worth the same amount all tournament. Knock someone
  out, collect it, and your own head stays worth what it always was.
* **progressive** — knock someone out and you collect part of their bounty in
  cash; the rest is added to your own head, so the player who has been winning
  is the one worth chasing.

Everything here is integer cents and every function conserves them: what leaves
one player's head arrives somewhere, to the cent. A bounty pool that loses a
cent per knockout is somebody paying for the rounding out of their own pocket.

This module is deliberately free of Django models — it takes numbers and gives
numbers back, so the rules can be tested without a database or a running hand.
"""

from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class BountyConfig:
    """How one tournament pays knockouts."""

    mode: str = "none"                  # "none" | "fixed" | "progressive"
    amount_cents: int = 0               # what one buy-in puts on a head
    progressive_split_pct: int = 50     # progressive: share paid out in cash

    @property
    def enabled(self) -> bool:
        return self.mode in ("fixed", "progressive") and self.amount_cents > 0

    @classmethod
    def from_tournament(cls, tournament) -> "BountyConfig":
        return cls(
            mode=tournament.bounty_mode or "none",
            amount_cents=max(0, tournament.bounty_cents or 0),
            progressive_split_pct=_clamp_pct(tournament.bounty_progressive_split_pct),
        )


@dataclass(frozen=True)
class BountyAward:
    """One player's share of one knockout."""

    eliminator_index: int   # index into the eliminators list handed in
    cash_cents: int         # paid out, theirs to keep
    to_head_cents: int      # added to their own bounty (progressive only)


def _clamp_pct(value) -> int:
    try:
        return max(0, min(100, int(value)))
    except (TypeError, ValueError):
        return 50


def split_knockout(
    config: BountyConfig,
    victim_bounty_cents: int,
    eliminator_count: int,
    is_final_knockout: bool = False,
) -> List[BountyAward]:
    """Divide one busted player's bounty between whoever knocked them out.

    `victim_bounty_cents` is what was actually on their head, which in a
    progressive game is more than a buy-in's worth once they have knocked
    somebody out themselves.

    `is_final_knockout` marks the hand that ends the tournament. There is no
    point growing the last player's head — nobody is left to collect it — so the
    whole bounty is paid in cash. Without this the winner's own bounty has to be
    handed back to them at settlement anyway; doing it here keeps the running
    totals on screen honest.

    Remainders go to the first eliminator rather than being dropped. With a
    three-way split of an odd amount somebody has to get the extra cent.
    """
    if eliminator_count <= 0 or victim_bounty_cents <= 0 or not config.enabled:
        return []

    base, remainder = divmod(victim_bounty_cents, eliminator_count)
    awards: List[BountyAward] = []
    for index in range(eliminator_count):
        share = base + (1 if index < remainder else 0)
        if config.mode == "progressive" and not is_final_knockout:
            cash = share * config.progressive_split_pct // 100
        else:
            cash = share
        awards.append(
            BountyAward(
                eliminator_index=index,
                cash_cents=cash,
                to_head_cents=share - cash,
            )
        )
    return awards


def starting_bounty_cents(config: BountyConfig) -> int:
    """What one buy-in puts on a head — also what a rebuy puts back."""
    return config.amount_cents if config.enabled else 0


def prize_pool_share_cents(config: BountyConfig, buy_in_cents: int) -> int:
    """The part of one buy-in that the payout structure pays out.

    The rest is the bounty. A bounty at or above the buy-in would leave nothing
    to place for, so it is capped here as well as validated on the way in.
    """
    if not config.enabled:
        return max(0, buy_in_cents)
    return max(0, buy_in_cents - config.amount_cents)
