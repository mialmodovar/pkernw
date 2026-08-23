"""Reading a player's week back out of the games they played.

Kept apart from missions.py, which is arithmetic and copy: this is the one part
that needs a database, and it exists so that nothing has to be counted as it
happens. A tally taken from the record cannot drift from the record.

Fast games and cash. A tournament is an evening rather than a thing you do
three of, and a daily mission that could be finished by sitting down at one on
Tuesday would be a mission about waiting.

The cash tally counts hands rather than sessions, for the same reason it counts
finished games rather than started ones: a hand is over, and a cash session is
not over until somebody decides it is.
"""

from django.db.models import Count, Max, Q

from tournaments.fastgames import FAST_TOURNAMENT_FORMATS
from tournaments.models import TournamentPlayer


def counts_for(user, start, end):
    """What this player did between those two moments.

    One query. Every tally the catalogue can ask for is here rather than only
    the ones some mission currently uses — the alternative is a query per
    mission, and the difference between them is one CASE in the SELECT.

    A game counts when it *finished* in the window. Sitting down at 23:58 and
    winning at 00:03 is tomorrow's game, which is the reading that cannot pay
    the same game into two different days.
    """
    seats = TournamentPlayer.objects.filter(
        user=user,
        tournament__format__in=FAST_TOURNAMENT_FORMATS,
        tournament__status="finished",
        tournament__finished_at__gte=start,
        tournament__finished_at__lt=end,
    )

    tally = seats.aggregate(
        games=Count("id"),
        wins=Count("id", filter=Q(finish_position=1)),
        spins=Count("id", filter=Q(tournament__format="spingo")),
        sitngos=Count("id", filter=Q(tournament__format="sitngo")),
        knockouts=Count("id", filter=Q(knockouts__gt=0)),
        best_spin=Max("tournament__spin_multiplier"),
    )

    from cash.models import CashHandSeat

    from .missions import BIG_MULTIPLIER

    # Hands dealt to this player at a cash table in the same window. A second
    # query rather than a join: the two records have nothing to do with each
    # other, and the one thing they share is the clock.
    cash_hands = CashHandSeat.objects.filter(
        user=user, played_at__gte=start, played_at__lt=end,
    ).count()

    best_spin = tally["best_spin"] or 0
    return {
        "games": tally["games"],
        "wins": tally["wins"],
        "spins": tally["spins"],
        "sitngos": tally["sitngos"],
        "knockouts": tally["knockouts"],
        # "One of each" is two formats played, not two games — so it counts how
        # many of the two have happened at all.
        "formats": int(tally["spins"] > 0) + int(tally["sitngos"] > 0),
        "best_spin": best_spin,
        "big_spin": int(best_spin >= BIG_MULTIPLIER),
        "cash_hands": cash_hands,
    }
