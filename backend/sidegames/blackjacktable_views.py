"""The six requests the shared blackjack table is played through.

One endpoint per thing a player can press, and one shape for every answer:
`{"table": ..., "balance": ...}`. As in the solo game next door, the balance
rides along with every response because most of these move it.

The payload is built field by field, and that is the whole security model of
this table: BlackjackTable.deck is the undealt shoe and BlackjackTable.dealer
holds both of the dealer's cards from the moment they are dealt. Neither may
reach a client while the round is live. A serialiser with an exclude list would
put one careless field addition between eight players and the rest of the shoe.
Nothing is sent unless it is named here.

Every endpoint — the read included — walks the table's clock forward before it
answers. There is no worker: see blackjacktable.advance. That is why `GET` is
not a safe method here in the HTTP sense, and why it is a GET anyway: it is a
read as far as the caller is concerned, and the writing it does is the table
catching up with a wall clock rather than anything the caller asked for.
"""

from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.avatars import avatar_url
from accounts.naming import shown_name

from . import blackjack, blackjacktable, games


def _player_payload(user) -> dict:
    """One player, drawn the way every other list of faces in this app draws
    them — see tournaments/fastgames_views._seat_face, which this matches so a
    person looks the same at a blackjack table as in a tournament lobby."""
    profile = getattr(user, "profile", None)
    image = getattr(user, "avatar_image", None)
    return {
        "username": user.username,
        "display_name": shown_name(user.username, profile.display_name if profile else ""),
        "avatar_emoji": (profile.avatar_emoji if profile else None) or "\U0001F0CF",
        "avatar_border": (profile.avatar_border if profile else "") or "",
        "avatar_url": avatar_url(user.id, image.updated_at if image else None),
    }


def _dealer_payload(table) -> dict:
    """The dealer's hand as the table is allowed to see it.

    Face down until the round is settled, and — the part that is easy to get
    wrong — the total is of the up card alone while it is. Sending the true
    total beside a hidden card gives the hole card away by subtraction, which
    looks like nothing until somebody notices the number moves when the second
    card lands.
    """
    cards = list(table.dealer or [])
    hidden = table.phase != blackjacktable.SETTLING and len(cards) > 1
    shown = [cards[0], blackjack.HIDDEN] if hidden else cards
    counted = cards[:1] if hidden else cards
    total, soft = blackjack.hand_value(counted)
    return {
        "cards": shown,
        "total": total,
        "soft": soft,
        # Never true while a card is still face down, for the same reason the
        # total is of the up card only.
        "blackjack": (not hidden) and blackjack.is_blackjack(cards),
    }


def _hand_payload(hand, index: int, hands, mine: bool, playing: bool, balance: int) -> dict:
    total, soft = blackjack.hand_value(hand["cards"])
    active = blackjacktable.active_hand(hands)
    # Only your own seat is ever offered a button, only while the round is being
    # played, and only when the turn is actually yours — `playing` carries all
    # three, see _seat_payload. Everybody else's `can` is all-false: they are
    # somebody else's decisions and this client has no business being told it
    # could make them. A player waiting for their turn is offered `plan` on the
    # seat instead, which promises a move rather than making one.
    can = (
        blackjack.actions_for(hands, index, active)
        if (mine and playing) else dict(blackjack.NO_ACTIONS)
    )
    # A double or a split takes a second stake the size of this hand's. A button
    # the wallet cannot pay for is not a legal move, and `can` is meant to be
    # the whole truth about what will be accepted.
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


def _seat_payload(seat, *, mine: bool, playing: bool, balance: int) -> dict:
    hands = seat.hands or []
    return {
        "seat": seat.seat,
        "player": _player_payload(seat.user),
        "bet": seat.bet,
        "hands": [
            _hand_payload(hand, index, hands, mine, playing, balance)
            for index, hand in enumerate(hands)
        ],
        "net": seat.net,
        "idle_rounds": seat.idle_rounds,
        # What this seat has chosen to do when its turn comes. Only ever your
        # own: a plan is a thing you have not done yet, and the table knowing
        # what the seat beside it is about to do is a table playing somebody
        # else's hand.
        "planned": (seat.planned or None) if mine else None,
    }


def table_payload(table, user, balance: int) -> dict:
    """The table, as one client is served it.

    Always eight seats, in order, empty ones included. A client that had to work
    out which chairs exist from a list of the occupied ones would be a client
    that draws a different table to everybody else's.
    """
    seated = {seat.seat: seat for seat in table.seats.select_related("user", "user__profile")}
    mine = next((seat for seat in seated.values() if seat.user_id == user.id), None)
    playing = table.phase == blackjacktable.PLAYING
    return {
        "phase": table.phase,
        "ends_in": blackjacktable.seconds_left(table.phase_ends_at),
        "round": table.round_number,
        # Whose turn it is, so every client can draw the same seat lit up and
        # the clock above it can be read as that seat's rather than the table's.
        "turn": table.turn,
        "min_bet": games.BLACKJACK.min_stake,
        "max_bet": games.BLACKJACK.max_stake,
        "dealer": _dealer_payload(table),
        "seats": [
            _seat_payload(
                seated[number],
                mine=seated[number].user_id == user.id,
                playing=playing and table.turn == number,
                balance=balance,
            ) if number in seated else {
                "seat": number, "player": None, "bet": 0,
                "hands": [], "net": 0, "idle_rounds": 0, "planned": None,
            }
            for number in range(blackjacktable.SEATS)
        ],
        "my_seat": mine.seat if mine is not None else None,
    }


def _respond(user, result):
    """One answer shape for all six endpoints.

    A refusal still carries the table, because the usual reason for one is that
    the table has moved on since the client last looked — the window closed, the
    seat went — and the cure is the same either way: here is the table as it
    actually is, draw that.
    """
    balance = blackjacktable.balance_of(user)
    if isinstance(result, str):
        return Response(
            {
                "error": result,
                "table": table_payload(blackjacktable.look(user), user, balance),
                "balance": balance,
            },
            status=400,
        )
    return Response({"table": table_payload(result, user, balance), "balance": balance})


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def blackjack_table(request):
    """The table as it stands — and, because there is no worker, the request
    that walks its clock forward. See the note at the top of this file."""
    return _respond(request.user, blackjacktable.look(request.user))


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def blackjack_table_join(request):
    """Join the game. There is no seat to choose — see blackjacktable.join."""
    return _respond(request.user, blackjacktable.join(request.user))


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def blackjack_table_leave(request):
    return _respond(request.user, blackjacktable.leave(request.user))


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def blackjack_table_bet(request):
    return _respond(
        request.user, blackjacktable.place_bet(request.user, request.data.get("amount")),
    )


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def blackjack_table_act(request):
    return _respond(
        request.user, blackjacktable.act(request.user, request.data.get("action")),
    )


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def blackjack_table_plan(request):
    """Choose now what to do when the turn arrives. An empty action cancels."""
    return _respond(
        request.user, blackjacktable.plan(request.user, request.data.get("action")),
    )
