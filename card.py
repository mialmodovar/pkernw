"""Card, rank, suit, and deck primitives."""

from __future__ import annotations
import random
from dataclasses import dataclass
from enum import Enum
from typing import List


class Suit(Enum):
    HEARTS   = "h"
    DIAMONDS = "d"
    CLUBS    = "c"
    SPADES   = "s"

    def __str__(self) -> str:
        return {"h": "♥", "d": "♦", "c": "♣", "s": "♠"}[self.value]


class Rank(Enum):
    TWO   = 2
    THREE = 3
    FOUR  = 4
    FIVE  = 5
    SIX   = 6
    SEVEN = 7
    EIGHT = 8
    NINE  = 9
    TEN   = 10
    JACK  = 11
    QUEEN = 12
    KING  = 13
    ACE   = 14

    def __str__(self) -> str:
        return {
            2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8",
            9: "9", 10: "T", 11: "J", 12: "Q", 13: "K", 14: "A",
        }[self.value]


@dataclass(frozen=True)
class Card:
    rank: Rank
    suit: Suit

    def __str__(self) -> str:
        return f"{self.rank}{self.suit}"

    def __repr__(self) -> str:
        return str(self)


class Deck:
    def __init__(self) -> None:
        self._cards: List[Card] = [
            Card(r, s) for r in Rank for s in Suit
        ]
        random.shuffle(self._cards)

    def deal(self, n: int = 1) -> List[Card]:
        if n > len(self._cards):
            raise ValueError("Not enough cards remaining in deck")
        cards, self._cards = self._cards[:n], self._cards[n:]
        return cards

    def __len__(self) -> int:
        return len(self._cards)


def cards_str(cards: List[Card]) -> str:
    return "  ".join(str(c) for c in cards)
