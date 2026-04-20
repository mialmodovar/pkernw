"""Tournament configuration: blind levels, ante, duration."""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Tuple


@dataclass
class BlindLevel:
    small_blind: int
    big_blind: int
    ante: int
    duration_hands: int

    def __str__(self) -> str:
        ante_str = f" / Ante {self.ante:,}" if self.ante > 0 else ""
        return (
            f"SB {self.small_blind:,} / BB {self.big_blind:,}"
            f"{ante_str}  ({self.duration_hands} hands)"
        )


# A reasonable 12-level default structure for a ~1,000-hand tournament
DEFAULT_BLIND_STRUCTURE: List[BlindLevel] = [
    BlindLevel(25,   50,    0,   8),
    BlindLevel(50,   100,   10,  8),
    BlindLevel(75,   150,   25,  8),
    BlindLevel(100,  200,   25,  8),
    BlindLevel(150,  300,   50,  6),
    BlindLevel(200,  400,   50,  6),
    BlindLevel(300,  600,   75,  6),
    BlindLevel(400,  800,   100, 6),
    BlindLevel(500,  1000,  100, 6),
    BlindLevel(750,  1500,  200, 4),
    BlindLevel(1000, 2000,  300, 4),
    BlindLevel(1500, 3000,  500, 4),
]


@dataclass
class TournamentConfig:
    """Full tournament configuration.

    players:        list of (name, is_human) tuples
    starting_chips: chip stack each player begins with
    levels:         ordered list of BlindLevel objects
    """
    players: List[Tuple[str, bool]]
    starting_chips: int = 10_000
    levels: List[BlindLevel] = field(
        default_factory=lambda: list(DEFAULT_BLIND_STRUCTURE)
    )

    def display_structure(self) -> None:
        print("\n  Blind Structure:")
        print("  " + "-" * 44)
        for i, lvl in enumerate(self.levels, 1):
            print(f"  Level {i:>2}: {lvl}")
        print("  " + "-" * 44)
