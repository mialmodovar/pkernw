from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from tournaments.models import Tournament

from .hand_stats import compute_player_stats
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
        .prefetch_related("actions__player__user")
        .order_by("-hand_number", "-id")[:limit]
    )
    return Response(HandSerializer(hands, many=True).data)


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
