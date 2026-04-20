"""5- and 7-card hand evaluator for NL Hold'em.

evaluate(cards) returns a comparable tuple; higher tuple = stronger hand.
The first element is the hand category (0=High Card … 8=Straight Flush).
Subsequent elements are tiebreakers so Python's tuple comparison works directly.
"""

from __future__ import annotations
from collections import Counter
from itertools import combinations
from typing import List, Tuple

from card import Card

# Hand category constants (lower index = weaker)
HIGH_CARD       = 0
ONE_PAIR        = 1
TWO_PAIR        = 2
THREE_OF_A_KIND = 3
STRAIGHT        = 4
FLUSH           = 5
FULL_HOUSE      = 6
FOUR_OF_A_KIND  = 7
STRAIGHT_FLUSH  = 8


def evaluate(cards: List[Card]) -> Tuple:
    """Return the best 5-card score from a 5-7 card collection."""
    if len(cards) < 5:
        raise ValueError("Need at least 5 cards to evaluate")
    return max(_score_five(combo) for combo in combinations(cards, 5))


def hand_name(score: Tuple) -> str:
    names = {
        HIGH_CARD:       "High Card",
        ONE_PAIR:        "One Pair",
        TWO_PAIR:        "Two Pair",
        THREE_OF_A_KIND: "Three of a Kind",
        STRAIGHT:        "Straight",
        FLUSH:           "Flush",
        FULL_HOUSE:      "Full House",
        FOUR_OF_A_KIND:  "Four of a Kind",
        STRAIGHT_FLUSH:  "Straight Flush",
    }
    label = names.get(score[0], "Unknown")
    if score[0] == STRAIGHT_FLUSH and score[1] == 14:
        label = "Royal Flush"
    return label


# ---------------------------------------------------------------------------
# Pre-flop hand strength estimate (0.0 – 1.0) used by the bot
# ---------------------------------------------------------------------------
_PREMIUM = {(14, 14), (13, 13), (12, 12), (11, 11)}
_STRONG  = {(10, 10), (9, 9), (14, 13), (14, 12), (14, 11)}


def preflop_strength(hole_cards: List[Card]) -> float:
    """Rough pre-flop strength 0–1 for two hole cards."""
    r1, r2 = sorted([c.rank.value for c in hole_cards], reverse=True)
    suited  = hole_cards[0].suit == hole_cards[1].suit
    pair    = r1 == r2

    if pair:
        return 0.5 + (r1 - 2) / 24          # 0.5 (22) → ~1.0 (AA)

    gap     = r1 - r2
    base    = (r1 + r2 - 4) / 24            # rough rank value
    suited_bonus = 0.06 if suited else 0
    gap_penalty  = gap * 0.03

    return max(0.0, min(1.0, base + suited_bonus - gap_penalty))


# ---------------------------------------------------------------------------
# Internal scorer
# ---------------------------------------------------------------------------

def _score_five(cards) -> Tuple:
    ranks = sorted([c.rank.value for c in cards], reverse=True)
    suits = [c.suit for c in cards]

    is_flush    = len(set(suits)) == 1
    uniq        = set(ranks)

    # Straight detection (including A-2-3-4-5 wheel)
    is_straight = False
    straight_high = ranks[0]
    if len(uniq) == 5:
        if ranks[0] - ranks[4] == 4:
            is_straight = True
        elif ranks == [14, 5, 4, 3, 2]:
            is_straight  = True
            straight_high = 5

    if is_straight and is_flush:
        return (STRAIGHT_FLUSH, straight_high)
    if is_flush:
        return (FLUSH, *ranks)
    if is_straight:
        return (STRAIGHT, straight_high)

    counts   = Counter(ranks)
    # Sort groups: primary key = frequency desc, secondary = rank desc
    groups   = sorted(counts.items(), key=lambda x: (x[1], x[0]), reverse=True)
    g_ranks  = [r for r, _ in groups]
    g_counts = [c for _, c in groups]

    if g_counts[0] == 4:
        return (FOUR_OF_A_KIND,  g_ranks[0], g_ranks[1])
    if g_counts[0] == 3 and g_counts[1] == 2:
        return (FULL_HOUSE,      g_ranks[0], g_ranks[1])
    if g_counts[0] == 3:
        return (THREE_OF_A_KIND, g_ranks[0], g_ranks[1], g_ranks[2])
    if g_counts[0] == 2 and g_counts[1] == 2:
        return (TWO_PAIR,        g_ranks[0], g_ranks[1], g_ranks[2])
    if g_counts[0] == 2:
        return (ONE_PAIR,        g_ranks[0], g_ranks[1], g_ranks[2], g_ranks[3])

    return (HIGH_CARD, *ranks)
