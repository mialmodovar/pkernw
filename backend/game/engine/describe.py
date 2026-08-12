"""Says what a holding is, the way a player would say it.

`hand_name` gives the category — "One Pair" — which is what the pot maths needs.
At the table you want to hear "Pair of Aces", or "Ace high" before the flop.
"""

from collections import Counter

from .evaluator import (
    FLUSH, FOUR_OF_A_KIND, FULL_HOUSE, HIGH_CARD, ONE_PAIR, STRAIGHT,
    STRAIGHT_FLUSH, THREE_OF_A_KIND, TWO_PAIR, best_five,
)

RANK_WORD = {
    14: "Ace", 13: "King", 12: "Queen", 11: "Jack", 10: "Ten", 9: "Nine",
    8: "Eight", 7: "Seven", 6: "Six", 5: "Five", 4: "Four", 3: "Three", 2: "Two",
}
PLURAL = {"Six": "Sixes", **{word: word + "s" for value, word in RANK_WORD.items() if word != "Six"}}


def _word(rank_value):
    return RANK_WORD.get(rank_value, str(rank_value))


def _plural(rank_value):
    return PLURAL.get(_word(rank_value), _word(rank_value) + "s")


def describe(hole_cards, community_cards):
    """A short phrase for what this player currently holds, or None."""
    hole = list(hole_cards or [])
    if not hole:
        return None

    cards = hole + list(community_cards or [])
    if len(cards) < 5:
        return _describe_preflop(hole)

    score, best = best_five(cards)
    ranks = sorted((card.rank.value for card in best), reverse=True)
    counts = Counter(ranks)
    by_count = sorted(counts.items(), key=lambda item: (item[1], item[0]), reverse=True)
    category = score[0]

    if category == STRAIGHT_FLUSH:
        top = _straight_top(ranks)
        return "Royal flush" if top == 14 else f"Straight flush to the {_word(top)}"
    if category == FOUR_OF_A_KIND:
        return f"Four of a kind, {_plural(by_count[0][0])}"
    if category == FULL_HOUSE:
        return f"Full house, {_plural(by_count[0][0])} over {_plural(by_count[1][0])}"
    if category == FLUSH:
        return f"Flush, {_word(ranks[0])} high"
    if category == STRAIGHT:
        return f"Straight to the {_word(_straight_top(ranks))}"
    if category == THREE_OF_A_KIND:
        return f"Three of a kind, {_plural(by_count[0][0])}"
    if category == TWO_PAIR:
        pairs = sorted((rank for rank, count in counts.items() if count == 2), reverse=True)
        return f"Two pair, {_plural(pairs[0])} and {_plural(pairs[1])}"
    if category == ONE_PAIR:
        return f"Pair of {_plural(by_count[0][0])}"
    if category == HIGH_CARD:
        return f"{_word(ranks[0])} high"
    return None


def _straight_top(ranks):
    """The top of the straight, allowing for the wheel, where the ace plays low."""
    unique = sorted(set(ranks), reverse=True)
    if unique == [14, 5, 4, 3, 2]:
        return 5
    return unique[0]


def _describe_preflop(hole):
    ranks = sorted((card.rank.value for card in hole), reverse=True)
    if len(ranks) == 2 and ranks[0] == ranks[1]:
        return f"Pair of {_plural(ranks[0])}"
    return f"{_word(ranks[0])} high"
