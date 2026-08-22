"""Sitting down at a game that has no host.

One lobby for every instant format — Spin n Go, Heads Up, 6-Max — because they
are the same thing three times over: a fixed shape at a fixed price, a queue per
tier, and a game that fires the moment its seats fill. What differs between them
lives in fastgames.py; what happens when somebody presses Sit lives here.

The whole of `sit` is one locked block, because the thing it must never do is
seat a seventh player in a game of six. Two players pressing Sit at the same
moment on the same tier is the normal case, not the rare one.
"""

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.avatars import avatar_url
from accounts.naming import shown_name
from accounts.notify import notify_user
from sidegames.models import CoinLedger

from . import fastgames, spingo
from .absentees import drop_absent_registrations
from .coinbank import balance_of, charge_entry, refund_entry, stake_memo
from .models import BlindLevel, Tournament, TournamentPlayer

# The statuses a seat of yours is still live in. A finished one is not: it
# belongs to the history rather than to the tables you have open.
LIVE_STATUSES = ("lobby", "running", "paused")

# How many of your own games to look back over, and how many record draws to
# keep on the board. Ten is an evening; three is a podium.
HISTORY_LENGTH = 10
TOP_LENGTH = 3


def _seat_face(player):
    """One player, as the tier card and the history draw them."""
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
    fmt = fastgames.format_for(fastgames.key_for_tournament(tournament))
    players = list(tournament.players.select_related("user", "user__profile"))
    seats_needed = fmt.seats if fmt else tournament.max_players
    return {
        "id": tournament.id,
        "key": fmt.key if fmt else None,
        "label": fmt.label if fmt else tournament.name,
        "status": tournament.status,
        "stake": tournament.buy_in_coins,
        "seats": len(players),
        "seats_needed": seats_needed,
        "spin_multiplier": tournament.spin_multiplier,
        "prize_coins": fastgames.pot_coins(
            fmt, tournament.buy_in_coins, len(players), tournament.spin_multiplier,
        ) if fmt else 0,
        "waiting": [_seat_face(player) for player in players],
    }


def _open_game(fmt, stake, *, user=None, locked=False):
    """The queue for this tier — the game a player sitting now would join.

    The oldest one that is not yet full, so a tier with two half-filled games
    finishes the first before starting on the second. Seat count is part of the
    lookup: it is the only thing telling one Sit n Go from the other.

    A game `user` is already sitting in is not a queue they can join: one player
    must never hold two of the three seats. Sitting at a tier you are already
    waiting at therefore opens a second game rather than doubling up in the
    first, which is what a second registration means everywhere else too.
    """
    games = Tournament.objects.filter(
        format=fmt.tournament_format,
        players_per_table=fmt.seats,
        buy_in_coins=stake,
        status="lobby",
    )
    if user is not None:
        games = games.exclude(players__user=user)
    if locked:
        games = games.select_for_update()
    for game in games.order_by("created_at"):
        if game.players.count() < fmt.seats:
            return game
    return None


def _my_queue_at(fmt, stake, user):
    """A game of yours at this exact tier that has not started yet.

    One waiting seat per tier is the limit. Beyond that, pressing Sit again at a
    tier you are already queued at only splits the tier into two half-full
    tables that each need strangers to fill — you would be waiting on more
    people for the same number of games. Once yours is dealing it stops
    blocking, so a player who wants a second Heads Up can queue one the moment
    the first is underway.
    """
    return (
        Tournament.objects.filter(
            format=fmt.tournament_format,
            players_per_table=fmt.seats,
            buy_in_coins=stake,
            status="lobby",
            players__user=user,
        )
        .order_by("created_at")
        .first()
    )


def _my_live_games(user):
    """Every fast game of yours that is waiting or dealing, of any kind.

    A list rather than one game. Registering for a Heads Up while a Spin n Go
    fills up is the ordinary way to use a lobby of instant games, and the tables
    have had a tab strip across the top since they could be opened at once — so
    the thing this used to enforce, one game at a time, was a limit with nothing
    behind it. What is still impossible is two seats in the same game; see
    _open_game.

    Newest first, because the one you just sat at is the one you are waiting on.
    """
    return list(
        Tournament.objects.filter(
            format__in=fastgames.FAST_TOURNAMENT_FORMATS,
            status__in=LIVE_STATUSES,
            players__user=user,
        )
        .distinct()
        .order_by("-created_at")
        .prefetch_related("players__user__profile", "players__user__avatar_image")
    )


def _tier_payload(fmt, stake, user=None):
    game = _open_game(fmt, stake, user=user)
    tier = {
        "key": fmt.key,
        "stake": stake,
        "seats_needed": fmt.seats,
        "starting_chips": fmt.starting_chips,
        "big_blinds": fmt.big_blinds,
        "game": _game_payload(game) if game is not None else None,
    }
    if fmt.draws_multiplier:
        tier["odds"] = spingo.odds_table(stake)
    else:
        # What a Sit n Go pays, which is knowable before anybody sits: the
        # buy-ins, split the way the format splits them.
        tier["payouts"] = [
            {**row, "coins": stake * fmt.seats * row["percentage"] // 100}
            for row in fastgames.payout_structure(fmt)
        ]
    return tier


def _format_payload(fmt, user=None):
    return {
        "key": fmt.key,
        "label": fmt.label,
        "icon": fmt.icon,
        "blurb": fmt.blurb,
        "seats": fmt.seats,
        "duration": fmt.duration,
        "big_blinds": fmt.big_blinds,
        "level_minutes": fmt.level_minutes,
        "draws_multiplier": fmt.draws_multiplier,
        "tiers": [_tier_payload(fmt, stake, user) for stake in fmt.stakes],
    }


def _finished_payload(tournament, *, me=None, returns=None):
    """A game that is over, as one line of history.

    Everything printed comes off rows already loaded — the seats, and the coins
    the reader was actually paid — so a list of ten costs one query for the
    games, one for their seats and one for the payouts.
    """
    fmt = fastgames.format_for(fastgames.key_for_tournament(tournament))
    seats = list(tournament.players.all())
    winner = next((seat for seat in seats if seat.finish_position == 1), None)
    mine = next((seat for seat in seats if seat.user_id == getattr(me, "id", None)), None)
    return {
        "id": tournament.id,
        "key": fmt.key if fmt else None,
        "label": fmt.label if fmt else tournament.name,
        "seats_needed": fmt.seats if fmt else tournament.max_players,
        "stake": tournament.buy_in_coins,
        "multiplier": tournament.spin_multiplier,
        "prize_coins": fastgames.pot_coins(
            fmt, tournament.buy_in_coins, len(seats), tournament.spin_multiplier,
        ) if fmt else 0,
        "winner": _seat_face(winner) if winner is not None else None,
        "finished_at": tournament.finished_at or tournament.started_at,
        # Where you came, when you were in it at all. The board of record draws
        # is everybody's, so this is null on most of those rows.
        "my_finish": mine.finish_position if mine is not None else None,
        "i_won": bool(mine is not None and mine.finish_position == 1),
        # What you were actually paid. Read from the coin ledger rather than
        # worked out from the place: a six-max pays two of them, and second
        # place taking something is exactly the case arithmetic here would miss.
        "my_return": (returns or {}).get(tournament.id, 0),
    }


def _finished_games(queryset, limit, *order, formats=fastgames.FAST_TOURNAMENT_FORMATS):
    """Finished fast games, ordered then cut — a slice cannot be reordered.

    A Spin n Go with no draw on it never really happened: the multiplier is
    stamped at the moment the game fires, so a finished one without it is a row
    left behind rather than a game somebody played, and it has no prize to
    report. Sit n Gos have no draw at all and are counted as they are.
    """
    return (
        queryset.filter(format__in=formats, status="finished")
        .exclude(Q(format="spingo") & Q(spin_multiplier=0))
        .prefetch_related("players__user__profile", "players__user__avatar_image")
        .order_by(*order)
        [:limit]
    )


def _returns_for(user, tournaments):
    """What this player was paid out of each of these games, in one query."""
    by_memo = {stake_memo(one.id): one.id for one in tournaments}
    if not by_memo:
        return {}
    paid = {}
    rows = CoinLedger.objects.filter(
        user=user, reason="payout", memo__in=list(by_memo),
    ).values_list("memo", "amount")
    for memo, amount in rows:
        game_id = by_memo[memo]
        paid[game_id] = paid.get(game_id, 0) + amount
    return paid


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def fast_lobby(request):
    """Every instant format, your seat in one, and what has happened.

    One request rather than one per tab: the lobby polls this while it is open
    whichever tab is on screen, because a game you are queued for fires whether
    or not you are looking at it.
    """
    # A queue with somebody in it who closed the app never fills, and the game
    # never fires — so the lobby clears those seats on its way past. See
    # absentees.py; five minutes away is enough here, because sitting in a queue
    # is itself the statement that you are ready to play now.
    drop_absent_registrations(timezone.now(), here=request.user.id)

    my_games = _my_live_games(request.user)

    mine_finished = list(_finished_games(
        Tournament.objects.filter(players__user=request.user),
        HISTORY_LENGTH, "-finished_at", "-id",
    ))
    returns = _returns_for(request.user, mine_finished)
    # The biggest draws anybody has had. What makes the Spin n Go worth a look
    # is that the hundred-times is real, and a list of them is the proof.
    biggest = _finished_games(
        Tournament.objects.filter(spin_multiplier__gt=0),
        TOP_LENGTH, "-spin_multiplier", "-finished_at",
        formats=("spingo",),
    )

    return Response({
        "formats": [
            _format_payload(fastgames.FORMATS[key], request.user)
            for key in fastgames.FORMAT_KEYS
        ],
        # Every seat you hold, not just the latest one: the lobby draws one row
        # per game and the tab strip at the table needs all of them.
        "my_games": [_game_payload(game) for game in my_games],
        "balance": balance_of(request.user),
        "history": [
            _finished_payload(game, me=request.user, returns=returns) for game in mine_finished
        ],
        "top": [_finished_payload(game, me=request.user) for game in biggest],
    })


def _announce_start(game, payload, *, filled_by):
    """Tell everybody at a game that just fired, except whoever filled it.

    The player who took the last seat is standing in front of the answer: their
    own request returns the started game and takes them to the table. Everybody
    else sat down some minutes ago and went somewhere else — another table, the
    club page, a backgrounded tab — and the only thing that was telling them was
    the lobby's poll, which is not running unless the lobby is on screen. Now
    that a player can hold seats at several tiers at once, that is most of the
    time.

    The message goes to the presence socket, which is open wherever they are.
    What it does not do is move them: somebody halfway through a hand at another
    table is not to be dragged out of it. The client rings, and they decide.
    """
    message = {"type": "fast_game_started", "game": payload}
    for user_id in game.players.exclude(user_id=filled_by).values_list("user_id", flat=True):
        notify_user(user_id, message)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def fast_sit(request):
    """Take a seat at a tier, paying for it, and fire the game if that fills it."""
    key = str(request.data.get("key") or "").strip()
    try:
        stake = int(request.data.get("stake"))
    except (TypeError, ValueError):
        return Response({"error": "Pick a stake"}, status=status.HTTP_400_BAD_REQUEST)

    if not fastgames.is_tier(key, stake):
        return Response({"error": "That is not a table on offer"}, status=status.HTTP_400_BAD_REQUEST)
    fmt = fastgames.format_for(key)

    queued = _my_queue_at(fmt, stake, request.user)
    if queued is not None:
        return Response(
            {
                "error": "You are already waiting at this table",
                "game": _game_payload(queued),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if balance_of(request.user) < stake:
        return Response({"error": "Not enough coins"}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        game = _open_game(fmt, stake, user=request.user, locked=True)
        if game is None:
            game = _new_game(fmt, stake, request.user)
        elif game.players.count() >= fmt.seats:
            # Locked above, so the count cannot move under us between here and
            # the seat being written — which is the whole reason for the lock.
            return Response({"error": "That table just filled up"}, status=status.HTTP_409_CONFLICT)

        # Paid before the seat is written, and inside the same transaction: a
        # seat nobody paid for is a game with a prize that came from nowhere,
        # and a payment with no seat is worse.
        if not charge_entry(request.user, game):
            transaction.set_rollback(True)
            return Response({"error": "Not enough coins"}, status=status.HTTP_400_BAD_REQUEST)

        _seat(fmt, game, request.user)

        if game.players.count() >= fmt.seats:
            fields = ["spin_multiplier", "status", "started_at"]
            if fmt.draws_multiplier:
                game.spin_multiplier = spingo.draw_multiplier()
                # A big draw pays every seat, so the split is stamped on now,
                # with the number that decided it. Working it out at settlement
                # instead would leave the table and the lobby promising a
                # winner-takes-all prize that the ledger then divides.
                game.payout_structure = spingo.payout_for(game.spin_multiplier)
                fields.append("payout_structure")
            game.status = "running"
            game.started_at = timezone.now()
            game.save(update_fields=fields)

    game.refresh_from_db()
    payload = _game_payload(game)
    # After the block, so it is a committed game being announced: a rollback
    # here would otherwise have rung three phones about a game nobody is in.
    # The same payload the sitter is about to be handed, built once.
    if game.status == "running":
        _announce_start(game, payload, filled_by=request.user.id)

    return Response(
        {"game": payload, "balance": balance_of(request.user)},
        status=status.HTTP_201_CREATED,
    )


def _new_game(fmt, stake, user):
    """Open the queue for a tier, with its blind ladder and its one table.

    The host FK has to point at somebody, so it points at whoever sat first —
    but can_manage_tournament refuses every management button on a fast game, so
    it buys them nothing. Nobody runs one of these.
    """
    game = Tournament.objects.create(host=user, **fastgames.tournament_defaults(fmt, stake))
    BlindLevel.objects.bulk_create([
        BlindLevel(tournament=game, **row) for row in fastgames.level_rows(fmt)
    ])
    game.ensure_table(1)
    return game


def _seat(fmt, game, user):
    table = game.ensure_table(1)
    taken = set(game.players.values_list("seat", flat=True))
    seat = next(s for s in range(fmt.seats) if s not in taken)
    return TournamentPlayer.objects.create(
        tournament=game, user=user, table=table,
        seat=seat, seat_at_table=seat, chips=game.starting_chips,
        time_bank_seconds_remaining=game.time_bank_seconds,
    )


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def fast_leave(request):
    """Give up a seat that has not been dealt to, and take the coins back.

    Which seat, now that a player can hold several: `game` names it, and without
    one the newest queue you are in is assumed — the one a Leave button drawn
    before this endpoint could name ids would have meant.
    """
    try:
        wanted = int(request.data.get("game")) if request.data.get("game") else None
    except (TypeError, ValueError):
        return Response({"error": "That is not a game"}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        queued = (
            Tournament.objects.select_for_update()
            .filter(
                format__in=fastgames.FAST_TOURNAMENT_FORMATS,
                status="lobby",
                players__user=request.user,
            )
            .order_by("-created_at")
        )
        if wanted is not None:
            queued = queued.filter(pk=wanted)
        game = queued.first()
        if game is None:
            return Response(
                {"error": "You have no game waiting to start"},
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
