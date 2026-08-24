"""Whose turn it is to pay, hand after hand, on a tournament table.

The rule everybody at a table can feel is simple: the big blind moves one player
every hand, round and round. Everything else — the small blind, the button —
follows from where the big blind is.

It is worth stating that way round, because a tournament table is renumbered
constantly. Seats are handed out afresh before every hand so the field stays
balanced across tables, and a player who re-enters goes in *among* the players
already sitting rather than on the end. Seat 3 is not the same person it was
last hand, and neither is "position 3 in the list".

That is the bug this module exists for. The button was kept as a position: a
player re-entered ahead of it, everybody behind them shifted along one, and the
same position now named the player one earlier — the button had gone backwards,
so the blinds did not move and the same player paid the big blind again. Two
re-entries in two hands meant three big blinds in a row.

Tracking the button by player instead is not enough either: somebody sitting
down between the button and the blinds pushes the blinds one player further
round, and the player who just paid pays again. So the blind is what is
followed, and the button is placed relative to it — which is what a live dealer
does with the disc in their hand.
"""


def next_big_blind(order, previous=None, previous_index=None):
    """Who puts the big blind up this hand.

    `order` is the players being dealt in, in seating order, named by whatever
    identity is stable across hands — a tournament-player id, never a seat.
    `previous` is who paid it last hand; `previous_index` where they stood in
    that hand's order, used only if they are no longer at the table.

    Returns the identity, or None for a table with nobody at it.
    """
    if not order:
        return None
    if previous is None:
        # A fresh table: whoever is second in the order pays it, which puts the
        # button where a first hand normally starts.
        return order[1 % len(order)]
    if previous in order:
        return order[(order.index(previous) + 1) % len(order)]
    # They have gone — busted holding the blind. Carry on from where they stood:
    # the players behind them have closed up, so that position now holds
    # whoever was next along.
    start = 0 if previous_index is None else previous_index
    return order[start % len(order)]


def button_index(count, blind_index):
    """Where the button goes, given who is in the big blind.

    Two seats back, which is what makes the player in front of the blind the
    small blind — except heads-up, where the button *is* the small blind and so
    sits one back instead.
    """
    if count <= 0:
        return 0
    if count == 2:
        return (blind_index - 1) % count
    return (blind_index - 2) % count
