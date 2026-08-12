from django.db.models import Min, Sum
from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from game.models import HandAction
from tournaments.models import TournamentPlayer

NON_VOLUNTARY_PREFLOP_ACTIONS = ["fold", "blind", "ante", "check"]


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

    tp_ids = tps.values_list("id", flat=True)
    actions = HandAction.objects.filter(player_id__in=tp_ids)
    hands_played = actions.values("hand_id").distinct().count()
    vpip_hands = (
        actions.filter(street="preflop")
        .exclude(action__in=NON_VOLUNTARY_PREFLOP_ACTIONS)
        .values("hand_id").distinct().count()
    )
    pfr_hands = (
        actions.filter(street="preflop", action="raise")
        .values("hand_id").distinct().count()
    )

    return Response({
        "tournaments_played": tournaments_played,
        "best_finish": best_finish,
        "cashes": cashes,
        "total_rebuys": total_rebuys,
        "hands_played": hands_played,
        "vpip_pct": round(vpip_hands / hands_played * 100, 1) if hands_played else 0,
        "pfr_pct": round(pfr_hands / hands_played * 100, 1) if hands_played else 0,
    })
