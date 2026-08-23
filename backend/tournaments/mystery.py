"""Mystery bounties: the pool is known, which envelope you get is not.

A knockout tournament where every head is worth the same is a game of arithmetic
— you can work out whether calling is right before you call. A mystery bounty
takes the same money out of the same buy-ins and hides it: the pool is cut into
envelopes of wildly different sizes, and busting somebody draws one at random.
Most of them are worth about a buy-in. One of them is worth the night.

Two things are deliberately NOT random here:

* **The envelopes.** What is in the pool is worked out from the pool and the
  number of draws left, and it is the same list for the same numbers. Real
  mystery bounty events publish the remaining envelopes on a board precisely
  because knowing what is left is part of the tension. Only the draw is a
  gamble.
* **When they open.** The bounties stay sealed until a moment the tournament
  announces — the money, or the close of registration — and pay nothing before
  it. That is what makes them mysterious rather than merely random: everybody
  busting out early was worth something to somebody, and nobody knows what.

Everything here is integer cents, and every function conserves them: the
envelopes always add up to exactly the pool that was put in. A pool that loses a
cent to rounding is somebody paying for it out of their own pocket.

Free of Django, like bounties.py next door — numbers in, numbers out.
"""

from typing import List

# When the envelopes open.
RELEASE_ITM = "itm"
RELEASE_REG_CLOSED = "reg_closed"
RELEASE_CHOICES = [
    (RELEASE_ITM, "When the money is reached"),
    (RELEASE_REG_CLOSED, "When registration closes"),
]
RELEASE_KEYS = tuple(key for key, _ in RELEASE_CHOICES)
DEFAULT_RELEASE = RELEASE_ITM


def clean_release(value) -> str:
    """One of ours, or the default. Nothing else reaches the engine."""
    text = str(value or "").strip()
    return text if text in RELEASE_KEYS else DEFAULT_RELEASE


def _weights(count: int) -> List[float]:
    """The shape of the pool: one big envelope, a couple of good ones, and a
    long tail of ordinary ones.

    Top-heaviness scales with how many envelopes there are. A final table of
    nine can afford a prize worth a third of the pool; four envelopes cannot,
    because taking a third out of four leaves the other three barely different
    from each other and the whole thing stops being a gamble worth taking.
    """
    if count <= 1:
        return [1.0]

    weights = [1.0] * count
    top = min(10.0, max(2.0, count / 2))
    weights[0] = top
    if count >= 4:
        weights[1] = max(1.5, top / 2)
    if count >= 8:
        weights[2] = max(1.2, top / 4)
    return weights


def envelope_amounts(pool_cents: int, count: int) -> List[int]:
    """Cut a pool into `count` envelopes, biggest first.

    Adds up to exactly the pool, by the largest-remainder method: shares are
    floored and the cents left over go to whoever was cheated most by the
    flooring. Nothing is dropped and nothing is invented.

    No envelope is ever empty. Drawing one and finding nothing in it is the
    single worst thing this feature could do to somebody, so where the pool is
    too small to shape it, the cents are spread as evenly as they will go.
    """
    pool = max(0, int(pool_cents))
    count = max(0, int(count))
    if count == 0 or pool == 0:
        return []
    if count == 1:
        return [pool]

    weights = _weights(count)
    total_weight = sum(weights)

    exact = [pool * weight / total_weight for weight in weights]
    amounts = [int(value) for value in exact]
    # Largest remainder: the cents lost to flooring go back to the envelopes
    # that lost the most of one, in order.
    short = pool - sum(amounts)
    order = sorted(range(count), key=lambda index: exact[index] - amounts[index], reverse=True)
    for index in order[:short]:
        amounts[index] += 1

    return _no_empty_envelopes(amounts, pool)


def _no_empty_envelopes(amounts: List[int], pool: int) -> List[int]:
    """Move a cent into every empty envelope, from the fullest one.

    Only ever reached by a pool smaller than the number of draws, which means a
    buy-in of a few cents. It still has to add up, and nobody may draw nothing —
    until there is genuinely not a cent each, at which point the tail is as
    empty as the arithmetic allows and there is nothing to be done about it.
    """
    if pool >= len(amounts):
        while True:
            empty = [index for index, value in enumerate(amounts) if value <= 0]
            if not empty:
                break
            richest = max(range(len(amounts)), key=lambda index: amounts[index])
            if amounts[richest] <= 1:
                break
            amounts[richest] -= 1
            amounts[empty[0]] += 1
    return sorted(amounts, reverse=True)


def draw_index(envelopes: List[int], rng) -> int:
    """Which envelope this knockout gets. Uniform — the amounts are the gamble.

    The generator is an argument so a test can say which one it wants, the same
    way the Spin n Go draw takes one.
    """
    if not envelopes:
        return -1
    return rng.randrange(len(envelopes))


def take(envelopes: List[int], index: int):
    """Open one envelope: what was in it, and what is left in the pool."""
    if index < 0 or index >= len(envelopes):
        return 0, list(envelopes)
    remaining = list(envelopes)
    amount = remaining.pop(index)
    return amount, remaining


def registration_closed(
    blind_level_number: int,
    late_reg_level: int,
    rebuy_level: int,
    allow_rebuys: bool,
) -> bool:
    """Whether the field is final: nobody may enter and nobody may buy back in.

    Both, because either one still open means another buy-in — and another
    buy-in is another bounty that belongs in a pool that has already been cut
    into envelopes.
    """
    if blind_level_number <= max(0, late_reg_level or 0):
        return False
    if allow_rebuys and blind_level_number <= max(0, rebuy_level or 0):
        return False
    return True


def should_release(
    release: str,
    *,
    remaining_players: int,
    paid_places: int,
    registration_is_closed: bool,
) -> bool:
    """Whether the envelopes open now.

    In the money means the field is down to the places that pay — from here on
    everybody left is guaranteed something, which is the moment these events
    traditionally start opening envelopes. Registration closing is the earlier
    of the two and the one that suits a shorter game: the pool cannot grow any
    more, so it can be cut up.
    """
    if clean_release(release) == RELEASE_REG_CLOSED:
        return bool(registration_is_closed)
    return paid_places > 0 and remaining_players <= paid_places


def pool_cents(bounty_cents: int, entries: int) -> int:
    """Everything the buy-ins put into the mystery pool.

    Every entry, including rebuys, and including the entries of players who
    busted long before the envelopes opened — their bounty was paid for and it
    is in there.
    """
    return max(0, bounty_cents) * max(0, entries)


def envelope_count(remaining_players: int, winner_keeps_own: bool = False) -> int:
    """How many envelopes to cut the pool into.

    One per knockout still to come, which is everybody but the winner — the
    ordinary reading, and the one where the whole pool is drawn by the people
    who did the knocking out.

    Or one per head, where the format says the winner keeps their own. Then the
    last envelope is never drawn by anybody: it is the one that was on the
    winner's own head all along, and it goes to them at settlement. That is the
    whole difference between "the bounties are the prize pool" and "the bounties
    are a prize pool the winner is not in".
    """
    remaining = max(0, remaining_players)
    if winner_keeps_own:
        return remaining
    return max(0, remaining - 1)
