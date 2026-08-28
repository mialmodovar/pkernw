"""The six requests a blackjack round is made of.

One endpoint per thing a player can press, and one shape for every answer:
`{"round": ..., "balance": ...}`. The balance rides along with every response
because every one of these can move it — a deal takes a stake, a double takes
another, a settlement pays back — and a client that had to ask separately would
draw a balance that was right a moment ago.

The payload is built field by field rather than by serialising the row, and
that is the whole security model of this game: BlackjackRound.deck is the
undealt cards, the dealer's hole card is in BlackjackRound.dealer, and neither
may ever reach the client while the round is live. A ModelSerializer with an
exclude list would put one careless field addition between a player and the
rest of the deck. Nothing is sent unless it is named here.

The other half of not trusting the client is `can`. It is served on every hand,
it is the server's word on what is legal, and every mutating endpoint asks the
same function again before it acts — see blackjackbank._act. A client that
offers a split on K+Q gets a refusal, not a split.
"""

from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from . import blackjack, blackjackbank
from .economy import wallet_for


def _dealer_payload(round_, playing: bool) -> dict:
    """The dealer's hand as the player is allowed to see it.

    While the round is live that is the up card and a "??" — and, importantly,
    a total of the up card alone. Sending the true total next to a hidden card
    would give the hole card away by subtraction, which is a mistake that looks
    like nothing until somebody notices that the total moved when the second
    card landed.
    """
    cards = list(round_.dealer or [])
    shown = [cards[0], blackjack.HIDDEN] if playing and len(cards) > 1 else cards
    counted = cards[:1] if playing and len(cards) > 1 else cards
    total, soft = blackjack.hand_value(counted)
    return {
        "cards": shown,
        "total": total,
        "soft": soft,
        # Never true while the round is live: the peek happens on the deal, so a
        # dealer blackjack has already ended the round by the time this could
        # say so, and saying it any earlier would be telling the player the hole
        # card. See blackjackbank.deal.
        "blackjack": (not playing) and blackjack.is_blackjack(cards),
    }


def _hand_payload(round_, index: int, playing: bool, balance: int) -> dict:
    hand = round_.hands[index]
    total, soft = blackjack.hand_value(hand["cards"])
    can = (
        blackjack.actions_for(round_.hands, index, round_.active)
        if playing else dict(blackjack.NO_ACTIONS)
    )
    # A double you cannot pay for is not a legal double, and `can` is supposed
    # to be the whole truth about what will be accepted. Both of these take
    # another stake the size of this hand's, so both are asked the same
    # question — better a button that is not offered than one that refuses.
    if balance < hand["stake"]:
        can["double"] = False
        can["split"] = False
    return {
        "cards": list(hand["cards"]),
        "total": total,
        "soft": soft,
        "stake": hand["stake"],
        "doubled": hand["doubled"],
        "from_split": hand["from_split"],
        "status": hand["status"],
        "outcome": hand["outcome"],
        "returned": hand["returned"],
        "can": can,
    }


def round_payload(round_, balance: int):
    """A round, as the client is served it. None for no round at all."""
    if round_ is None:
        return None
    playing = round_.status == blackjack.PLAYING
    return {
        "id": round_.id,
        "stake": round_.stake,
        "status": round_.status,
        "dealer": _dealer_payload(round_, playing),
        "hands": [
            _hand_payload(round_, index, playing, balance)
            for index in range(len(round_.hands))
        ],
        "active": round_.active if playing else None,
        "net": round_.net,
    }


def _respond(user, result):
    """One answer shape for all six endpoints.

    A refusal still carries the round, because the reason for most refusals is
    that the round is not where the client thought it was — the hand already
    stood, the second tap arrived after the first — and the cure is the same
    either way: here is the round as it actually is, draw that.
    """
    balance = wallet_for(user).balance
    if isinstance(result, str):
        return Response(
            {
                "error": result,
                "round": round_payload(blackjackbank.open_round(user), balance),
                "balance": balance,
            },
            status=400,
        )
    return Response({"round": round_payload(result, balance), "balance": balance})


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def blackjack_round(request):
    """The round you are in the middle of, or nothing.

    Only an unfinished one. A round that has been settled has already been shown
    to whoever settled it, and handing it back on the next load would reopen a
    result the player has read and moved on from.
    """
    balance = wallet_for(request.user).balance
    return Response({
        "round": round_payload(blackjackbank.open_round(request.user), balance),
        "balance": balance,
    })


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def blackjack_deal(request):
    """Put a stake up and take two cards."""
    return _respond(request.user, blackjackbank.deal(request.user, request.data.get("stake")))


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def blackjack_hit(request):
    return _respond(request.user, blackjackbank.hit(request.user))


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def blackjack_stand(request):
    return _respond(request.user, blackjackbank.stand(request.user))


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def blackjack_double(request):
    return _respond(request.user, blackjackbank.double(request.user))


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def blackjack_split(request):
    return _respond(request.user, blackjackbank.split(request.user))
