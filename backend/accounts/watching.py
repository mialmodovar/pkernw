"""Keeping an eye on other players.

One-directional and unannounced — see the Watch model. This is the list, the
two ways to change it, and nothing else: what a watched player has actually
been doing is answered by the profile endpoint next door in stats.py.
"""

from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from game.consumers import connected_user_ids
from tournaments.models import TournamentPlayer

from .avatars import avatar_url
from .naming import shown_name
from .models import AvatarImage, Profile, Watch
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
    online = connected_user_ids() | online_user_ids()
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


@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def watching(request):
    if request.method == "POST":
        username = str(request.data.get("username") or "").strip()
        if not username:
            return Response({"error": "Who?"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            target = User.objects.get(username__iexact=username)
        except User.DoesNotExist:
            return Response({"error": f"No player called {username}."}, status=status.HTTP_404_NOT_FOUND)
        if target == request.user:
            return Response(
                {"error": "You already know how you are doing."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        Watch.objects.get_or_create(watcher=request.user, watched=target)

    watched_users = [watch.watched for watch in request.user.watching.select_related("watched")]
    user_ids = [user.id for user in watched_users]
    profiles = {
        row[0]: row[1:]
        for row in Profile.objects.filter(user__in=watched_users)
        .values_list("user_id", "avatar_emoji", "display_name")
    }
    stamps = dict(
        AvatarImage.objects.filter(user_id__in=user_ids).values_list("user_id", "updated_at")
    )
    # Whether they are there and what they are playing — a watch list that
    # cannot tell you somebody is at a table is only half of one.
    here = presence(user_ids)

    return Response([
        {
            "username": user.username,
            "display_name": shown_name(user.username, (profiles.get(user.id) or ("", ""))[1]),
            "avatar_emoji": (profiles.get(user.id) or ("", ""))[0] or "\U0001F0CF",
            "avatar_url": avatar_url(user.id, stamps.get(user.id)),
            **here[user.id],
        }
        for user in watched_users
    ])


@api_view(["DELETE"])
@permission_classes([permissions.IsAuthenticated])
def unwatch(request, username):
    request.user.watching.filter(watched__username__iexact=username).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# Enough to pick somebody out of, few enough that the list stays a list. A
# search that returns forty names is a directory, and nobody reads one.
SEARCH_LIMIT = 8
# One letter matches most of the room, which is not a suggestion.
SEARCH_MIN = 2


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def search_players(request):
    """Players whose name starts with, or contains, what has been typed.

    For the box that suggests people to watch. Matched on both names somebody
    has — what they signed up as and what they go by — because the person
    looking knows one of them and not necessarily which.

    Yourself and the people you already watch are left out: neither is somebody
    you can usefully be offered.
    """
    query = str(request.query_params.get("q") or "").strip()
    if len(query) < SEARCH_MIN:
        return Response([])

    already = set(request.user.watching.values_list("watched_id", flat=True))
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

    profiles = {
        row[0]: row[1:]
        for row in Profile.objects.filter(user__in=matches)
        .values_list("user_id", "avatar_emoji", "display_name")
    }
    stamps = dict(
        AvatarImage.objects.filter(user__in=matches).values_list("user_id", "updated_at")
    )

    def rank(user):
        display = (profiles.get(user.id) or ("", ""))[1] or ""
        starts = user.username.lower().startswith(query.lower()) or display.lower().startswith(query.lower())
        return (0 if starts else 1, user.username.lower())

    return Response([
        {
            "username": user.username,
            "display_name": shown_name(user.username, (profiles.get(user.id) or ("", ""))[1]),
            "avatar_emoji": (profiles.get(user.id) or ("", ""))[0] or "\U0001F0CF",
            "avatar_url": avatar_url(user.id, stamps.get(user.id)),
        }
        for user in sorted(matches, key=rank)[:SEARCH_LIMIT]
    ])
