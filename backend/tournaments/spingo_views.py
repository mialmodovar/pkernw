"""Sitting down at a Spin n Go.

Three endpoints and no create form. A tournament here is not somebody's night
that other people join — it is a queue the server keeps for each tier, opened
when the first player sits and fired the moment the third one does.

The whole of `sit` is one locked block, because the thing it must never do is
seat a fourth player in a game of three. Two players pressing Sit at the same
moment on the same tier is the normal case, not the rare one.
"""

from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.avatars import avatar_url
from accounts.naming import shown_name

from . import spingo
from .coinbank import balance_of, charge_entry, refund_entry
from .models import BlindLevel, Tournament, TournamentPlayer

# The statuses a seat of yours still ties you up in. A finished one does not:
# you can sit straight back down.
LIVE_STATUSES = ("lobby", "running", "paused")


def _seat_face(player):
    """One waiting player, as the tier card draws them."""
    user = player.user
    profile = getattr(user, "profile", None)
    image = getattr(user, "avatar_image", None)
    return {
        "username": user.username,
        "display_name": shown_name(user.username, profile.display_name if profile else ""),
        "avatar_emoji": (profile.avatar_emoji if profile else None) or "\U0001F0CF",
        "avatar_url": avatar_url(user.id, image.updated_at if image else None),
    }


def _game_payload(tournament):
    players = list(tournament.players.select_related("user", "user__profile"))
    return {
        "id": tournament.id,
        "status": tournament.status,
        "stake": tournament.buy_in_coins,
        "seats": len(players),
        "seats_needed": spingo.SEATS,
        "spin_multiplier": tournament.spin_multiplier,
        "prize_coins": spingo.prize_coins(tournament.buy_in_coins, tournament.spin_multiplier),
        "waiting": [_seat_face(player) for player in players],
    }


def _open_game(stake, *, locked=False):
    """The queue for this tier — the game a player sitting now would join.

    The oldest one that is not yet full, so a tier with two half-filled games
    finishes the first before starting on the second.
    """
    games = Tournament.objects.filter(format="spingo", buy_in_coins=stake, status="lobby")
    if locked:
        games = games.select_for_update()
    for game in games.order_by("created_at"):
        if game.players.count() < spingo.SEATS:
            return game
    return None


def _my_live_game(user):
    return (
        Tournament.objects.filter(
            format="spingo", status__in=LIVE_STATUSES, players__user=user,
        )
        .order_by("-created_at")
        .first()
    )


def _tier_payload(stake):
    game = _open_game(stake)
    return {
        "stake": stake,
        "seats_needed": spingo.SEATS,
        "starting_chips": spingo.STARTING_CHIPS,
        "big_blinds": spingo.STARTING_CHIPS // spingo.BLINDS[0][1],
        "game": _game_payload(game) if game is not None else None,
        "odds": spingo.odds_table(stake),
    }


# How many of your own games to look back over, and how many record draws to
# keep on the board. Ten is an evening; three is a podium.
HISTORY_LENGTH = 10
TOP_LENGTH = 3


def _finished_payload(tournament, *, me=None):
    """A game that is over, as one line of history.

    Everything printed comes off rows already loaded — the winner's seat and, if
    they were in it, the reader's own — so a list of ten costs one query for the
    games and one for their seats.
    """
    seats = list(tournament.players.all())
    winner = next((seat for seat in seats if seat.finish_position == 1), None)
    mine = next((seat for seat in seats if seat.user_id == getattr(me, "id", None)), None)
    return {
        "id": tournament.id,
        "stake": tournament.buy_in_coins,
        "multiplier": tournament.spin_multiplier,
        "prize_coins": spingo.prize_coins(tournament.buy_in_coins, tournament.spin_multiplier),
        "winner": _seat_face(winner) if winner is not None else None,
        "finished_at": tournament.finished_at or tournament.started_at,
        # Where you came, when you were in it at all. The board of record draws
        # is everybody's, so this is null on most of those rows.
        "my_finish": mine.finish_position if mine is not None else None,
        "i_won": bool(mine is not None and mine.finish_position == 1),
    }


def _finished_games(queryset, limit, *order):
    """Finished Spin n Gos, ordered then cut — a slice cannot be reordered."""
    return (
        queryset.filter(format="spingo", status="finished", spin_multiplier__gt=0)
        .prefetch_related("players__user__profile", "players__user__avatar_image")
        .order_by(*order)
        [:limit]
    )


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def spingo_lobby(request):
    """The tiers, what is waiting in them, your own seat, and what has happened.

    The history and the record board are here rather than behind endpoints of
    their own because they are read together, on one poll, by one screen — and a
    lobby that takes three requests to draw is three chances to draw half of it.
    """
    my_game = _my_live_game(request.user)

    mine_finished = _finished_games(
        Tournament.objects.filter(players__user=request.user), HISTORY_LENGTH,
        "-finished_at", "-id",
    )
    # The biggest draws anybody has had. What makes the format worth a look is
    # that the hundred-times is real, and a list of them is the proof.
    biggest = _finished_games(
        Tournament.objects.all(), TOP_LENGTH, "-spin_multiplier", "-finished_at",
    )

    return Response({
        "tiers": [_tier_payload(stake) for stake in spingo.STAKES],
        "my_game": _game_payload(my_game) if my_game is not None else None,
        "balance": balance_of(request.user),
        "history": [_finished_payload(game, me=request.user) for game in mine_finished],
        "top": [_finished_payload(game, me=request.user) for game in biggest],
    })


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def spingo_sit(request):
    """Take a seat at a tier, paying for it, and fire the game if that fills it."""
    try:
        stake = int(request.data.get("stake"))
    except (TypeError, ValueError):
        return Response({"error": "Pick a stake"}, status=status.HTTP_400_BAD_REQUEST)

    if not spingo.is_stake(stake):
        return Response({"error": "That is not a Spin n Go stake"}, status=status.HTTP_400_BAD_REQUEST)

    existing = _my_live_game(request.user)
    if existing is not None:
        return Response(
            {"error": "You are already in a Spin n Go", "game": _game_payload(existing)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if balance_of(request.user) < stake:
        return Response({"error": "Not enough coins"}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        game = _open_game(stake, locked=True)
        if game is None:
            game = _new_game(stake, request.user)
        else:
            # Locked above, so the count cannot move under us between here and
            # the seat being written — which is the whole reason for the lock.
            if game.players.count() >= spingo.SEATS:
                return Response({"error": "That table just filled up"}, status=status.HTTP_409_CONFLICT)

        # Paid before the seat is written, and inside the same transaction: a
        # seat nobody paid for is a game with a prize that came from nowhere,
        # and a payment with no seat is worse.
        if not charge_entry(request.user, game):
            transaction.set_rollback(True)
            return Response({"error": "Not enough coins"}, status=status.HTTP_400_BAD_REQUEST)

        _seat(game, request.user)

        seated = game.players.count()
        if seated >= spingo.SEATS:
            game.spin_multiplier = spingo.draw_multiplier()
            game.status = "running"
            game.started_at = timezone.now()
            game.save(update_fields=["spin_multiplier", "status", "started_at"])

    game.refresh_from_db()
    return Response(
        {"game": _game_payload(game), "balance": balance_of(request.user)},
        status=status.HTTP_201_CREATED,
    )


def _new_game(stake, user):
    """Open the queue for a tier, with its blind ladder and its one table.

    The host FK has to point at somebody, so it points at whoever sat first —
    but can_manage_tournament refuses every management button on a Spin n Go, so
    it buys them nothing. Nobody runs one of these.
    """
    game = Tournament.objects.create(host=user, **spingo.tournament_defaults(stake))
    BlindLevel.objects.bulk_create([
        BlindLevel(tournament=game, **row) for row in spingo.level_rows()
    ])
    game.ensure_table(1)
    return game


def _seat(game, user):
    table = game.ensure_table(1)
    taken = set(game.players.values_list("seat", flat=True))
    seat = next(s for s in range(spingo.SEATS) if s not in taken)
    return TournamentPlayer.objects.create(
        tournament=game, user=user, table=table,
        seat=seat, seat_at_table=seat, chips=game.starting_chips,
        time_bank_seconds_remaining=game.time_bank_seconds,
    )


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def spingo_leave(request):
    """Give up a seat that has not been dealt to, and take the coins back."""
    with transaction.atomic():
        game = (
            Tournament.objects.select_for_update()
            .filter(format="spingo", status="lobby", players__user=request.user)
            .order_by("-created_at")
            .first()
        )
        if game is None:
            return Response(
                {"error": "You have no Spin n Go waiting to start"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        TournamentPlayer.objects.filter(tournament=game, user=request.user).delete()
        refund_entry(request.user, game)

        remaining = list(game.players.select_related("user"))
        if not remaining:
            # Nothing was played and nobody is left, so there is no history to
            # keep — and an empty queue row would be offered to the next player
            # as a game with somebody in it.
            game.delete()
        elif game.host_id == request.user.id:
            game.host = remaining[0].user
            game.save(update_fields=["host"])

    return Response({"balance": balance_of(request.user)})
