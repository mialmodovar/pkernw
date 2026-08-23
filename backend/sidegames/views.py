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
from .missionbank import claim_mission, mission_board
from .shop import buy_border, buy_throwable, catalogue, owns_border


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
    """Buy one thing off one of the shelves.

    The shelf comes with the request rather than being guessed from the id:
    they are separate lists and nothing says a border and a throwable will
    never share a name.
    """
    item = str(request.data.get("item") or "").strip().lower()
    shelf = str(request.data.get("shelf") or "throwable").strip().lower()
    buy_it = {"throwable": buy_throwable, "border": buy_border}.get(shelf)
    if buy_it is None:
        return Response({"error": "No such shelf."}, status=400)

    result = buy_it(request.user, item)
    if isinstance(result, str):
        return Response({"error": result}, status=400)
    return Response({**wallet_payload(result), "items": catalogue(request.user)})


@api_view(["PATCH"])
@permission_classes([permissions.IsAuthenticated])
def wear_border(request):
    """Put on a border you own, or take one off.

    Ownership is checked here and not only in the shop: this endpoint is the
    other way a border id reaches the server, and a ring drawn on everybody
    else's screen is not something to take a client's word for.
    """
    from accounts.models import Profile

    from .borders import clean_border

    border = clean_border(request.data.get("border"))
    if border and not owns_border(request.user, border):
        return Response({"error": "You do not own that one."}, status=400)

    # get_or_create, like every other endpoint that writes to a profile: a
    # profile row is made the first time anybody needs one, and an update()
    # against a user who has never had one writes nothing at all while
    # answering as though it had.
    profile, _ = Profile.objects.get_or_create(user=request.user)
    profile.avatar_border = border
    profile.save(update_fields=["avatar_border"])
    return Response({"border": border})


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def missions(request):
    """What is worth doing today and this week, and how far along you are."""
    return Response({"missions": mission_board(request.user)})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def claim_mission_reward(request):
    """Take the coins for one that is finished.

    The check and the payment happen in one transaction behind a unique row, so
    two taps on a slow connection pay once — see missionbank.py.
    """
    paid = claim_mission(request.user, request.data.get("key"))
    if isinstance(paid, str):
        return Response({"error": paid}, status=400)
    wallet, coins = paid
    return Response({
        **wallet_payload(wallet),
        "coins": coins,
        "missions": mission_board(request.user),
    })
