"""Ranking one showdown hand against another.

The engine already knows which of two hands is better — that is how it awards
pots — but it knows it in the moment and then forgets. What it writes down is
the hand's name and, from now on, the score behind it. This ranks what was
written down, which is a different job with a different problem: some of it was
written before the score was.

Pure, so it can be tested by handing it hands.
"""

# The categories, worst to best, exactly as the evaluator names them. A hand
# recorded before scores were stored still has its name, which is enough to say
# that a flush beat a straight — just not which of two flushes was bigger.
CATEGORY_RANK = {
    "High Card": 0,
    "One Pair": 1,
    "Two Pair": 2,
    "Three of a Kind": 3,
    "Straight": 4,
    "Flush": 5,
    "Full House": 6,
    "Four of a Kind": 7,
    "Straight Flush": 8,
    "Royal Flush": 9,
}


def hand_rank(entry: dict) -> tuple:
    """How good a showdown hand was, as something sortable.

    The category first, then the engine's own score to separate two hands of
    the same kind. An old hand has no score and sorts below an equal-category
    hand that does — which is the right way round: the only thing lost is a
    tie-break, and the tie-break should not be won by the row that cannot
    supply one.
    """
    name = (entry or {}).get("hand_name") or ""
    score = (entry or {}).get("score") or []
    return (CATEGORY_RANK.get(name, -1), list(score))


def best_of(entries) -> dict:
    """The best of a player's showdown hands, or None if they have none."""
    best = None
    for entry in entries:
        if best is None or hand_rank(entry) > hand_rank(best):
            best = entry
    return best
