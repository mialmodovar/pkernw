"""Where everybody is: online, and at which table.

This was the watch list — a private list of faces and the two ways to change
it — and the list itself has become friends.py. What stayed is the half nothing
else could answer: who is actually in the app, what they are sitting in, and the
search box you find somebody through. Both are read by the friends panel, the
profile card and the header count, so they live apart from any one of them.
"""

from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from game.consumers import connected_user_ids
from tournaments.models import TournamentPlayer

from .models import Profile
from .people import people_payload
from .presence import online_user_ids

User = get_user_model()


def live_tournaments(user_ids):
    """The tournament each of these players is sitting in, keyed by user id.

    Only tournaments actually under way, and only seats still in them: a player
    knocked out an hour ago is not somewhere you can go and watch them. Where
    somebody is in more than one — the app allows it — the newest wins, on the
    grounds that it is the one they are most likely to be at.
    """
    rows = (
        TournamentPlayer.objects
        .filter(user_id__in=user_ids, is_eliminated=False)
        .filter(Q(tournament__status="running") | Q(tournament__status="paused"))
        .order_by("-tournament__created_at")
        .values("user_id", "tournament_id", "tournament__name", "tournament__status")
    )
    tables = {}
    for row in rows:
        tables.setdefault(row["user_id"], {
            "id": row["tournament_id"],
            "name": row["tournament__name"],
            "status": row["tournament__status"],
        })
    return tables


def everybody_online():
    """Every player with the app open, by either socket.

    One definition, used by the watch list below and by the count in the
    header, so the two can never disagree about what "online" means: the app
    itself, or a table. Somebody at a table counts through a presence socket
    that is mid-reconnect, and somebody reading the lobby counts without being
    at a table at all.
    """
    return connected_user_ids() | online_user_ids()


def presence(user_ids):
    """Who is online, and what they are playing — the two facts a watch list is
    for. Returned together because they are read together, and because one
    without the other is misleading: online but nowhere, or at a table with
    nobody home.

    Online is either socket: the app itself, or a table. A player at a table
    counts even while their presence socket is mid-reconnect, and one reading
    the lobby counts without being at a table at all — which for a long time
    they did not, and showed as offline with the app open in front of them."""
    tables = live_tournaments(user_ids)
    online = everybody_online()
    return {
        user_id: {
            "online": user_id in online,
            "tournament": tables.get(user_id),
            # Kept as its own flag: the ring on a face means "at a table", and
            # that stays true through a dropped connection.
            "playing_now": user_id in tables,
        }
        for user_id in user_ids
    }


# Enough to pick somebody out of, few enough that the list stays a list. A
# search that returns forty names is a directory, and nobody reads one.
SEARCH_LIMIT = 8
# One letter matches most of the room, which is not a suggestion.
SEARCH_MIN = 2


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def search_players(request):
    """Players whose name starts with, or contains, what has been typed.

    For the box you find a friend through. Matched on both names somebody has —
    what they signed up as and what they go by — because the person looking
    knows one of them and not necessarily which.

    Yourself and anybody there is already a friendship with, agreed or still
    asked, are left out: none of them is somebody you can usefully be offered.
    """
    query = str(request.query_params.get("q") or "").strip()
    if len(query) < SEARCH_MIN:
        return Response([])

    from .friends import Friendship

    already = set()
    for requester, addressee in Friendship.objects.filter(
        Q(requester=request.user) | Q(addressee=request.user),
    ).values_list("requester_id", "addressee_id"):
        already.add(addressee if requester == request.user.id else requester)
    already.add(request.user.id)

    named = set(
        Profile.objects.filter(display_name__icontains=query)
        .values_list("user_id", flat=True)
    )
    matches = list(
        User.objects.filter(Q(username__icontains=query) | Q(id__in=named))
        .exclude(id__in=already)
        # Whoever's name starts with what was typed comes first: somebody
        # typing "an" means Ana before Yohan.
        .order_by("username")[:SEARCH_LIMIT * 3]
    )

    cards = people_payload(matches)

    def rank(user):
        display = cards[user.id]["display_name"].lower()
        typed = query.lower()
        starts = user.username.lower().startswith(typed) or display.startswith(typed)
        return (0 if starts else 1, user.username.lower())

    return Response([cards[user.id] for user in sorted(matches, key=rank)[:SEARCH_LIMIT]])


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def online_now(request):
    """How many people are in the app right now.

    Two in-memory sets and a union — no database at all — which is why the
    header can ask for it on a timer without anybody having to think about the
    cost. What it deliberately is not is a broadcast: pushing a number to every
    connected client every time somebody opens a tab would put that work on the
    event loop the tournaments run on, in front of the next hand. A count that
    is half a minute stale is a count that is fine.

    Yourself included. A room of one is still a room you are in, and a counter
    that said "0 players online" to somebody looking at it would be arguing
    with them.
    """
    return Response({"online": len(everybody_online())})
