"""Who is at a cash table, and when they may come and go.

A cash table has no start and no end. People arrive mid-hand, leave in the
middle of somebody else's, sit out to answer the door and come back three hands
later — and none of that may touch a hand already being dealt. So every change
of seat is decided here, in terms of what the table looks like *between* hands,
and the runner applies it at the only safe moment.

Pure. The rules are small and the mistakes are expensive: a player dealt into a
hand they had left, or a seat given to two people, is a hand that has to be
thrown away — and in a cash game the chips in it are money.
"""

# A hand needs two players with chips who are not sitting out. Below that the
# table waits, which is what "waiting for players" means on a felt.
MIN_TO_DEAL = 2


def open_seats(taken, capacity):
    """The seat numbers nobody is in, lowest first."""
    return [seat for seat in range(capacity) if seat not in set(taken)]


def next_free_seat(taken, capacity):
    """Where the next arrival sits, or None when the table is full."""
    free = open_seats(taken, capacity)
    return free[0] if free else None


def can_deal(seats):
    """Whether there is a hand to be dealt.

    `seats` is dicts of {stack, sitting_out, leaving}. Somebody with no chips is
    not in: in a cash game a stack of zero is not a knockout, it is a player who
    has to reach for their wallet before the next hand.
    """
    return len(dealable(seats)) >= MIN_TO_DEAL


def dealable(seats):
    """The seats that take cards in the next hand, in seat order.

    Being there is one of the conditions. A seat whose player has no socket at
    the table is a chair with a stack in front of it and nobody behind it, and
    dealing to one means taking that player's blinds every orbit until they
    come back to find them gone. `is_here` is missing from a seat that nobody
    has asked the question about, and a missing answer is not a reason to stop
    dealing — the live layer is where it gets filled in.
    """
    return [
        seat for seat in sorted(seats, key=lambda one: one["seat"])
        if not seat.get("sitting_out")
        and not seat.get("leaving")
        and seat.get("is_here", True)
        and (seat.get("stack") or 0) > 0
    ]


def absent(seat):
    """Whether this seat is one nobody is playing right now.

    Away or sitting out. The two are different choices and the table treats
    them differently — a sit-out is a decision and a disconnection is not — but
    for the purposes of "is anybody there", they are the same answer.
    """
    return bool(seat.get("sitting_out")) or not seat.get("is_here", True)


# How many hands in a row somebody can let the clock run out before the table
# stops dealing them in. Two, because one is a phone call and two is a player
# who is not there — and the second one has already cost them a blind.
MISSES_BEFORE_SITTING_OUT = 2


def missed_the_clock(elapsed, action_seconds, slack=0.5):
    """Whether nobody actually acted on that turn.

    Inferred from how long it took, because that is the one thing the answer
    itself does not say: a fold arrives as a fold whether it was pressed or
    timed out. Taking the whole clock is the only way a decision gets made
    without anybody making it.
    """
    if not action_seconds or action_seconds <= 0:
        return False
    # The slack is half a second off a twenty-second clock, and a quarter of
    # anything shorter — a fixed half second is longer than some clocks, and
    # subtracting it from those would make every answer look like a timeout.
    return elapsed >= action_seconds - min(slack, action_seconds * 0.25)


def next_button(seats, previous_button):
    """Where the button goes for the next hand.

    Forward to the next player who is being dealt in, wrapping. The button
    moving over an empty seat is the ordinary case at a cash table, and it is
    why this cannot be "previous plus one".
    """
    playing = [one["seat"] for one in dealable(seats)]
    if not playing:
        return previous_button
    if previous_button is None:
        return playing[0]
    later = [seat for seat in playing if seat > previous_button]
    return later[0] if later else playing[0]


def sit_out_after_hand(seat):
    """Whether this seat should be sat out once the hand it is in finishes.

    A stack of nothing is the whole of it. They are not out of the game — they
    are out of chips, and the difference is a top-up.
    """
    return (seat.get("stack") or 0) <= 0


def is_bomb_pot(hand_number, every):
    """Whether this hand is a bomb pot.

    Counted from the first hand rather than from when the table opened, so
    "every ten hands" means the tenth, the twentieth, and so on — a table that
    restarted would otherwise deal one immediately, which is exactly when
    nobody has their bearings.
    """
    if not every or every <= 0 or hand_number <= 0:
        return False
    return hand_number % every == 0
