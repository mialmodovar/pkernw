from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .economy import (
    DAILY_COINS,
    can_claim_daily,
    claim_daily,
    next_claim_at,
    wallet_for,
)
from .games import GAMES
from .shop import buy_throwable, catalogue


def wallet_payload(wallet) -> dict:
    return {
        "balance": wallet.balance,
        "daily_amount": DAILY_COINS,
        "can_claim": can_claim_daily(wallet.last_claim_at),
        "next_claim_at": next_claim_at(wallet.last_claim_at),
    }


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def wallet(request):
    """Your coins, and whether today's are still there for the taking."""
    return Response({
        **wallet_payload(wallet_for(request.user)),
        # What they own, in the same breath. The table needs it to know which
        # throwables to offer, and it is fifteen rows.
        "items": catalogue(request.user),
        # The games these coins are good for, so a client does not have to
        # carry its own copy of the stake limits.
        "games": [
            {
                "id": game.id,
                "name": game.name,
                "blurb": game.blurb,
                "min_stake": game.min_stake,
                "max_stake": game.max_stake,
            }
            for game in GAMES.values()
        ],
    })


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def claim(request):
    claimed = claim_daily(request.user)
    if claimed is None:
        return Response({"error": "You have already taken today's coins."}, status=400)
    return Response(wallet_payload(claimed))


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def shop(request):
    return Response({
        **wallet_payload(wallet_for(request.user)),
        "items": catalogue(request.user),
    })


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def buy(request):
    result = buy_throwable(request.user, str(request.data.get("item") or "").strip().lower())
    if isinstance(result, str):
        return Response({"error": result}, status=400)
    return Response({**wallet_payload(result), "items": catalogue(request.user)})
