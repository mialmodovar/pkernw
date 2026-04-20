"""Player state for a single tournament seat."""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import List

from card import Card


@dataclass
class Player:
    name:     str
    chips:    int
    is_human: bool = True

    # ── per-hand state ──────────────────────────────────────────────────────
    hole_cards:       List[Card] = field(default_factory=list)
    current_bet:      int = 0   # chips committed in the *current street*
    total_invested:   int = 0   # chips committed across the whole hand
    is_folded:        bool = False
    is_all_in:        bool = False

    # ── tournament state ────────────────────────────────────────────────────
    is_eliminated:    bool = False
    finish_position:  int  = 0   # filled in when knocked out

    # ── session stats ───────────────────────────────────────────────────────
    hands_played:     int  = 0
    hands_won:        int  = 0

    # -----------------------------------------------------------------------

    def reset_for_hand(self) -> None:
        self.hole_cards     = []
        self.current_bet    = 0
        self.total_invested = 0
        self.is_folded      = False
        self.is_all_in      = False

    def bet(self, amount: int) -> int:
        """Commit *amount* chips (capped at stack).

        Returns the actual amount committed so callers can handle
        short-calls / all-in situations transparently.
        """
        actual           = min(amount, self.chips)
        self.chips      -= actual
        self.current_bet += actual
        self.total_invested += actual
        if self.chips == 0:
            self.is_all_in = True
        return actual

    def can_act(self) -> bool:
        """True when the player can still make a bet / raise decision."""
        return not self.is_folded and not self.is_all_in and self.chips > 0

    def __str__(self) -> str:
        return f"{self.name} ({self.chips:,} chips)"
