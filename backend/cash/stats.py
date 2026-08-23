"""What a player's cash play adds up to.

A tournament record is a list of finishes: how many you played, how often you
were paid, what you took home. None of that means anything at a cash table.
There is no finish, nobody is ever in the money, and "played one" is not a
number — you sit down, you play some hands, you pick your chips up. What there
is instead is hands, and what they came to.

Read back out of the hand rows rather than tallied anywhere: the same rule the
missions follow, and for the same reason — a total that is computed from the
record cannot drift from the record, and a total that is wrong can be walked
back to the hands that made it.
"""

from django.db.models import Count, Max, Sum

from .models import CashHandSeat, CashSeat
from .stakes import stake_for


def cash_summary(user):
    """One player's whole cash record.

    `net` is the honest number and the only one anybody actually wants: every
    hand's result added up. It includes the chips currently in front of them at
    a table they are still sitting at, because a session is not over just
    because they have not stood up yet — a stat that only became true when you
    quit would be a stat that lies while you are winning.
    """
    played = CashHandSeat.objects.filter(user=user)
    # Aliases that are not the column names: an aggregate named `net` becomes
    # what `net` means to every aggregate after it in the same call.
    tally = played.aggregate(
        hands=Count("id"),
        net_total=Sum("net"),
        best_pot=Max("won"),
        best_hand=Max("net"),
    )
    seated = CashSeat.objects.filter(user=user).select_related("table")

    return {
        "hands_played": tally["hands"] or 0,
        "net_coins": tally["net_total"] or 0,
        "biggest_pot": tally["best_pot"] or 0,
        "best_hand_coins": tally["best_hand"] or 0,
        "tables_open": seated.count(),
        # What is on the felt right now, which is part of the same money and
        # the reason a player's wallet looks smaller than their record.
        "on_the_felt": sum(seat.stack for seat in seated),
        "stakes_played": sorted(
            {
                label for label in (
                    _stake_label(row) for row in _stakes_of(user)
                ) if label
            },
        ),
    }


def _stakes_of(user):
    return (
        CashHandSeat.objects.filter(user=user)
        .values_list("hand__table__stake", flat=True)
        .distinct()
    )


def _stake_label(key):
    stake = stake_for(key)
    return stake.label if stake else ""
