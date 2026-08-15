from django.contrib.auth import get_user_model
from django.db.models import Min, Sum
from django.shortcuts import get_object_or_404
from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from game.hand_stats import compute_player_stats
from tournaments.models import LedgerEntry, TournamentPlayer

from .models import Profile

User = get_user_model()


def player_summary(user):
    """The record one player has, whoever is asking.

    Shared by "my stats" and by looking somebody up, so the two can never
    disagree about what a cash or a best finish is.
    """
    tps = TournamentPlayer.objects.filter(user=user).select_related("tournament")

    tournaments_played = tps.count()
    best_finish = tps.exclude(finish_position__isnull=True).aggregate(Min("finish_position"))["finish_position__min"]
    total_rebuys = tps.aggregate(Sum("rebuy_count"))["rebuy_count__sum"] or 0
    cashes = sum(
        1 for tp in tps
        if tp.finish_position and tp.tournament.payout_structure
        and tp.finish_position <= len(tp.tournament.payout_structure)
    )

    # Preflop reads come from the shared miner, so the lobby and the table can
    # never disagree about what VPIP means.
    preflop = compute_player_stats([user.id]).get(user.id, {})

    return {
        "tournaments_played": tournaments_played,
        "best_finish": best_finish,
        "cashes": cashes,
        "total_rebuys": total_rebuys,
        "hands_played": preflop.get("hands", 0),
        # Everything the miner knows, so a player can read the same numbers
        # about themselves that the table shows about everyone else.
        **preflop,
    }


def recent_results(user, limit=5):
    """The last few nights, newest first."""
    tps = (
        TournamentPlayer.objects
        .filter(user=user, tournament__status="finished")
        .select_related("tournament")
        .order_by("-tournament__created_at")[:limit]
    )
    prizes = dict(
        LedgerEntry.objects
        .filter(user=user, tournament__in=[tp.tournament_id for tp in tps])
        .values_list("tournament_id", "prize_cents")
    )
    return [
        {
            "tournament_id": tp.tournament_id,
            "name": tp.tournament.name,
            "played_at": tp.tournament.created_at,
            "finish_position": tp.finish_position,
            "entrants": tp.tournament.players.count(),
            "prize_cents": prizes.get(tp.tournament_id, 0),
        }
        for tp in tps
    ]


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def my_stats(request):
    return Response(player_summary(request.user))


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def player_profile(request, username):
    """Somebody else's record: the same figures, plus their last few nights."""
    user = get_object_or_404(User, username=username)
    profile, _ = Profile.objects.get_or_create(user=user)
    return Response({
        "username": user.username,
        "avatar_emoji": profile.avatar_emoji,
        "is_watched": request.user.watching.filter(watched=user).exists(),
        "stats": player_summary(user),
        "recent": recent_results(user),
    })
