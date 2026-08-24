from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from tournaments.models import Tournament

from .hand_stats import compute_player_stats
from .ice import has_relay, ice_servers
from .models import Hand
from .serializers import HandSerializer

MAX_HANDS = 20


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def tournament_hands(request, pk):
    """Recently completed hands, newest first, for reviewing what just happened."""
    if not Tournament.objects.filter(pk=pk).exists():
        return Response({"error": "Not found"}, status=404)

    try:
        limit = min(int(request.query_params.get("limit", 5)), MAX_HANDS)
    except (TypeError, ValueError):
        limit = 5

    hands = (
        Hand.objects.filter(tournament_id=pk, status="complete")
        .prefetch_related("actions__player__user__profile")
        .order_by("-hand_number", "-id")[:limit]
    )
    return Response(HandSerializer(hands, many=True).data)


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def hand_detail(request, pk):
    """One hand, by id.

    The review panel reads the last few hands of a tournament; this reads a
    named one, however long ago it was — which is what "show me the best hand I
    ever made" needs, since it is almost never among the last twenty.
    """
    hand = (
        Hand.objects.filter(pk=pk, status="complete")
        .prefetch_related("actions__player__user__profile")
        .first()
    )
    if hand is None:
        return Response({"error": "Not found"}, status=404)
    return Response(HandSerializer(hand).data)


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def tournament_player_stats(request, pk):
    """Lifetime preflop stats for everyone in this tournament.

    Lifetime rather than this tournament alone: a read on someone is only worth
    anything with a sample behind it, and a single tournament rarely has one.
    """
    if not Tournament.objects.filter(pk=pk).exists():
        return Response({"error": "Not found"}, status=404)

    players = list(
        Tournament.objects.get(pk=pk)
        .players.select_related("user")
        .values_list("user_id", "user__username")
    )
    stats = compute_player_stats([user_id for user_id, _ in players])
    return Response([
        {"username": username, **stats.get(user_id, {})}
        for user_id, username in players
    ])


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def ice_config(request):
    """Where the cameras at a table should look for each other.

    Asked for rather than built into the bundle, so a relay can be added or
    moved without a frontend release — see game/ice.py for why a relay is the
    difference between a player on mobile data seeing the table and seeing
    nothing at all.

    `relay` is sent alongside so the interface can tell one kind of failure
    from the other: with no relay configured, a pair that cannot connect is a
    pair nothing was ever going to connect, and saying so is better than a
    black rectangle.
    """
    servers = ice_servers()
    return Response({"ice_servers": servers, "relay": has_relay(servers)})
