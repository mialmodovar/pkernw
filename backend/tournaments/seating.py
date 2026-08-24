"""Where somebody sits down.

A seat is not a queue position. Registering, or busting and buying back in,
gives you the open chair — and which chair that is should be the luck of the
draw, the way it is when somebody walks back to a live table and takes the seat
the dealer points at.

It was the lowest free number instead, everywhere: the first free seat when
registering, the first free chair when a rebuy came back, and then a rebalance
that sorts by seat and packs everybody up from zero. The three together mean a
player who rebuys lands at the end of the row every single time, which is what
was reported — several rebuys, the same seat each time, never once between two
other players.

Pure, and the randomness is injected, because "it moved" is not a thing a test
can assert about a coin flip. The rng argument is what makes the arrangement
checkable rather than hopeful.
"""

import random


def free_seats(taken, capacity):
    """The seat numbers nobody is in, lowest first."""
    held = set(taken or ())
    return [seat for seat in range(max(0, int(capacity or 0))) if seat not in held]


def pick_free_seat(taken, capacity, rng=None):
    """One of the free seats, at random. None when there are none.

    Random rather than the first: the first is the one that just came free,
    which is how somebody who busts and comes back gets their own chair handed
    straight back to them.
    """
    free = free_seats(taken, capacity)
    if not free:
        return None
    return (rng or random).choice(free)


def seat_returning_players(order, returning, rng=None):
    """The seating order, with the players coming back dropped in at random.

    `order` is everybody at the table as they are sitting now, `returning` the
    ones who have just bought back in. Everybody else keeps their place
    relative to everybody else — nobody is moved because somebody else
    returned — and each returning player goes in at a random point, which is
    the whole of what "you get the open chair" means.
    """
    chooser = rng or random
    coming_back = [player for player in returning if player in order]
    if not coming_back:
        return list(order)

    seated = [player for player in order if player not in coming_back]
    for player in coming_back:
        # Anywhere in the row, the ends included: a chair between two players is
        # a chair, and so is the one on the end.
        seated.insert(chooser.randint(0, len(seated)), player)
    return seated
