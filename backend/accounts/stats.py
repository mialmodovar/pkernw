from django.db.models import Min, Sum
from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from game.hand_stats import compute_player_stats
from tournaments.models import TournamentPlayer

@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def my_stats(request):
    tps = TournamentPlayer.objects.filter(user=request.user).select_related("tournament")

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
    preflop = compute_player_stats([request.user.id]).get(request.user.id, {})

    return Response({
        "tournaments_played": tournaments_played,
        "best_finish": best_finish,
        "cashes": cashes,
        "total_rebuys": total_rebuys,
        "hands_played": preflop.get("hands", 0),
        "vpip_pct": preflop.get("vpip_pct", 0),
        "pfr_pct": preflop.get("pfr_pct", 0),
        "three_bet_pct": preflop.get("three_bet_pct", 0),
        "ats_pct": preflop.get("ats_pct", 0),
    })
