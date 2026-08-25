"""Friends Battle: the argument, settled.

Two friends who play together do not want a table of their statistics side by
side. They want to know who is winning — and, more than that, they want the one
line that will annoy the other one. So this counts only what happened in the
tournaments both of them actually sat in, and every row picks a side.

Nothing here is a serious measure of anybody's poker. "Who busts out first" is
not skill and neither is a rebuy count; that is the point. The honest numbers
are on the profile card already.

The arithmetic is pure and at the top, over plain dictionaries, because that is
the part that is easy to get subtly wrong and impossible to check by looking at
it. The queries underneath it only gather.
"""

from django.db.models import Sum
from django.utils import timezone

from tournaments.models import LedgerEntry, TournamentPlayer

# How a row is decided. `higher` means the bigger number wins the row, `lower`
# means the smaller one does — nobody wants to top the rebuy table, and coming
# 1st is a smaller number than coming 9th.
HIGHER, LOWER = "higher", "lower"


def row(key, label, mine, theirs, better=HIGHER, note="") -> dict:
    """One line of the battle, with the winner already worked out.

    A tie is a tie rather than a nudge in somebody's favour: two friends who
    have never knocked each other out are not "level on a technicality", they
    are level.
    """
    if mine == theirs:
        winner = "tie"
    elif (mine > theirs) == (better == HIGHER):
        winner = "me"
    else:
        winner = "them"
    return {
        "key": key,
        "label": label,
        "mine": mine,
        "theirs": theirs,
        "better": better,
        "winner": winner,
        "note": note,
    }


def score(rows) -> dict:
    """Rows won each, which is what the headline is.

    Ties count for nobody, and a battle where everything is level says so —
    which is a better answer than declaring somebody ahead by nothing.
    """
    mine = sum(1 for one in rows if one["winner"] == "me")
    theirs = sum(1 for one in rows if one["winner"] == "them")
    return {"mine": mine, "theirs": theirs, "leader": (
        "me" if mine > theirs else "them" if theirs > mine else "tie"
    )}


def finishes_won(shared) -> tuple:
    """Nights each of them finished above the other.

    `shared` is one entry per tournament they both played:
    {"mine": position or None, "theirs": position or None}. A night either of
    them is still playing counts for nobody — it is not over.
    """
    mine = theirs = 0
    for night in shared:
        a, b = night.get("mine"), night.get("theirs")
        if a is None or b is None:
            continue
        if a < b:
            mine += 1
        elif b < a:
            theirs += 1
    return mine, theirs


def best_of(values) -> int:
    """The best finish in a list of them, or 0 for somebody who has none.

    Zero rather than None because it is a row in a table of numbers, and the
    client prints "—" for it. `row` above would have to know about None
    otherwise, and comparing None to an int is how a page 500s.
    """
    real = [one for one in values if one]
    return min(real) if real else 0


def build(shared, totals) -> dict:
    """The whole battle, from what the queries gathered.

    `totals` carries the per-player sums over the shared nights only —
    knockouts, rebuys, prize money — because a friend who plays five nights a
    week elsewhere has not thereby won anything against you.
    """
    mine_wins, their_wins = finishes_won(shared)
    played = len(shared)

    rows = [
        row(
            "finishes", "Finished higher",
            mine_wins, their_wins,
            note="Nights one of you outlasted the other",
        ),
        row(
            "best", "Best finish",
            best_of([night.get("mine") for night in shared]),
            best_of([night.get("theirs") for night in shared]),
            better=LOWER,
            note="Together, not all time",
        ),
        row(
            "knockouts", "Scalps taken",
            totals["mine"]["knockouts"], totals["theirs"]["knockouts"],
            note="Players sent home on your nights out",
        ),
        row(
            "rebuys", "Bought back in",
            totals["mine"]["rebuys"], totals["theirs"]["rebuys"],
            better=LOWER,
            note="Losing this row is the good outcome",
        ),
        row(
            "winnings", "Taken home",
            totals["mine"]["winnings_cents"], totals["theirs"]["winnings_cents"],
            note="Prizes and bounties on the nights you both played",
        ),
    ]
    return {
        "nights": played,
        # The nights either of them is still in, which is why a score can look
        # short of the count above.
        "decided": sum(1 for one in shared if one.get("mine") and one.get("theirs")),
        "last_played": shared[0]["at"] if shared else None,
        "score": score(rows),
        "rows": rows,
    }


def shared_nights(user, other) -> list:
    """Every tournament both of them sat in, newest first."""
    mine = {
        row["tournament_id"]: row
        for row in TournamentPlayer.objects.filter(user=user)
        .values("tournament_id", "finish_position", "tournament__name", "tournament__created_at")
    }
    theirs = {
        row["tournament_id"]: row
        for row in TournamentPlayer.objects.filter(user=other)
        .values("tournament_id", "finish_position")
    }
    both = [key for key in mine if key in theirs]
    nights = [
        {
            "tournament_id": key,
            "name": mine[key]["tournament__name"],
            "at": mine[key]["tournament__created_at"],
            "mine": mine[key]["finish_position"],
            "theirs": theirs[key]["finish_position"],
        }
        for key in both
    ]
    nights.sort(key=lambda night: night["at"] or timezone.now(), reverse=True)
    return nights


def totals_over(user, tournament_ids) -> dict:
    """What one player did across those tournaments, in three sums."""
    seats = TournamentPlayer.objects.filter(user=user, tournament_id__in=tournament_ids)
    aggregate = seats.aggregate(Sum("knockouts"), Sum("rebuy_count"))
    winnings = LedgerEntry.objects.filter(
        user=user, tournament_id__in=tournament_ids,
    ).aggregate(Sum("prize_cents"))
    return {
        "knockouts": aggregate["knockouts__sum"] or 0,
        "rebuys": aggregate["rebuy_count__sum"] or 0,
        "winnings_cents": winnings["prize_cents__sum"] or 0,
    }


def between(user, other) -> dict:
    """The battle between two players, ready to be drawn."""
    nights = shared_nights(user, other)
    ids = [night["tournament_id"] for night in nights]
    return {
        **build(nights, {
            "mine": totals_over(user, ids),
            "theirs": totals_over(other, ids),
        }),
        # The last few, so the headline has something to point at.
        "recent": [
            {
                "tournament_id": night["tournament_id"],
                "name": night["name"],
                "mine": night["mine"],
                "theirs": night["theirs"],
            }
            for night in nights[:5]
        ],
    }
