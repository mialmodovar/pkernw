from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from asgiref.sync import async_to_sync
from django.db import transaction
from django.db.models import F, Prefetch, Q
from django.utils import timezone
from accounts.models import AvatarImage

from datetime import timedelta

from .absentees import drop_absent_registrations, seconds_until
from .fixtures import describe as describe_fixture
from .payoutbank import refresh_payouts
from .seating import pick_free_seat
from .fixturebank import open_due_fixtures, start_series, stop_series
from .announce import WARN_BEFORE_SECONDS, announce_start, announce_starting_soon
from .bounties import BountyConfig, starting_bounty_cents
from .coinbank import charge_entry, refund_entry
from .fastgames import FAST_TOURNAMENT_FORMATS
from .models import BlindLevel, Tournament, TournamentPlayer, TournamentSlug
from .permissions import StaffCreatesTournaments, can_manage_tournament
from .serializers import (
    TournamentListSerializer,
    TournamentDetailSerializer,
    TournamentCreateSerializer,
    TournamentUpdateSerializer,
    BlindLevelSerializer,
)

# Import shared runner reference from consumers (will be populated at runtime)
from game.consumers import (
    _tournament_runners,
    late_registration_open,
    rebuys_open,
    stop_tournament_engine,
)


def _sweep_lobby(here=None, now=None):
    """The housekeeping a lobby request runs on its way past.

    Two jobs that need doing regularly and have no scheduler to do them: start
    the tournaments whose time has come, and give up the seats of people who
    registered and then went away (see absentees.py). Both are cheap, both are
    idempotent, and both only matter while somebody is around to look at a
    lobby — which is exactly when this runs.
    """
    at = now or timezone.now()
    # Next Friday's game, opened a few days early so people can register for
    # it. Before the starts, because a night opened now may be due now.
    open_due_fixtures(at)
    _start_due_scheduled_tournaments()
    _warn_about_tournaments_about_to_start(at)
    drop_absent_registrations(at, here=here)


# How many have to be registered before a tournament starts itself.
#
# Three, not two. A night that fires on the stroke of nine with whoever happened
# to be early is a heads-up match nobody signed up for — and those two are then
# locked into it while the people who were a minute late find a game already
# running. Waiting for a third costs a few minutes and is what everybody assumed
# was happening anyway.
#
# A host pressing Start is a different matter and still needs only two: that is
# somebody choosing to play heads-up, out loud, rather than a clock choosing it
# for them.
MIN_TO_START_ITSELF = 3


def _start_due_scheduled_tournaments():
    now = timezone.now()
    due_tournaments = Tournament.objects.filter(
        status="lobby",
        scheduled_start_at__isnull=False,
        scheduled_start_at__lte=now,
    )
    for tournament in due_tournaments:
        if tournament.players.count() >= MIN_TO_START_ITSELF:
            tournament.status = "running"
            tournament.started_at = now
            tournament.save(update_fields=["status", "started_at"])
            # Whoever registered is not necessarily watching the clock. See
            # announce.py — this reaches them wherever they are in the app.
            announce_start(tournament)


def _warn_about_tournaments_about_to_start(now):
    """The five minutes before a scheduled start, once per tournament."""
    soon = Tournament.objects.filter(
        status="lobby",
        scheduled_start_at__isnull=False,
        scheduled_start_at__gt=now,
        scheduled_start_at__lte=now + timedelta(seconds=WARN_BEFORE_SECONDS),
    )
    for tournament in soon:
        announce_starting_soon(tournament, seconds_until(tournament.scheduled_start_at, now))


def manageable_tournament(user, pk):
    """The tournament, if this person may run it — otherwise None.

    Who that is lives in permissions.can_manage_tournament, since the same
    question is asked by the payload the lobby draws its buttons from.
    """
    tournament = Tournament.objects.filter(pk=pk).select_related("club").first()
    if tournament is None:
        return None
    return tournament if can_manage_tournament(user, tournament) else None


def _get_table_assignment(tournament, global_seat):
    table_number = (global_seat // tournament.players_per_table) + 1
    seat_at_table = global_seat % tournament.players_per_table
    table = tournament.ensure_table(table_number)
    return table, seat_at_table


class TournamentListCreateView(generics.ListCreateAPIView):
    queryset = Tournament.objects.all().order_by("-created_at")
    permission_classes = [StaffCreatesTournaments]

    # The faces on each card. Prefetched rather than looked up per tournament,
    # which would be three queries a row on a page that lists thirty of them —
    # and the avatar rows are loaded WITHOUT their bytes, since all the card
    # needs from a picture is the stamp that makes up its URL.
    ROSTER_PREFETCH = (
        # The seats first, with their player and emoji in the same query, then
        # the avatar rows hung off them. Order matters: a nested lookup like
        # "players__user__profile" would claim `players` with a queryset of its
        # own, and Django refuses to prefetch the same relation twice.
        Prefetch(
            "players",
            queryset=TournamentPlayer.objects
            .select_related("user", "user__profile")
            .order_by("seat"),
        ),
        Prefetch(
            "players__user__avatar_image",
            queryset=AvatarImage.objects.only("user_id", "updated_at"),
        ),
    )

    def get_queryset(self):
        return self._scoped_queryset().prefetch_related(*self.ROSTER_PREFETCH)

    def _scoped_queryset(self):
        _sweep_lobby(here=getattr(self.request.user, "id", None))
        scope = self.request.query_params.get("scope")
        user = self.request.user

        if scope == "upcoming":
            # A tournament in late registration is still joinable, so it belongs
            # here too — otherwise players who are not in it never see it.
            open_late_reg_ids = [
                tournament.id
                for tournament in Tournament.objects.filter(
                    status__in=["running", "paused"], late_reg_level__gt=0
                ).exclude(players__user=user)
                if late_registration_open(tournament)
            ]
            # Fast games are not browsable tournaments: they have no host, no
            # start button and nothing to read on a card, and they are sat at
            # from their own tabs. They stay in `mine_active` — the shortcut back
            # to your table and the redirect that opens it both read that scope —
            # but they are kept out of the list and out of the history, which is
            # where a night people arranged belongs.
            return Tournament.objects.exclude(format__in=FAST_TOURNAMENT_FORMATS).filter(
                Q(status="lobby") | Q(id__in=open_late_reg_ids)
            ).order_by(
                F("scheduled_start_at").asc(nulls_last=True), "-created_at"
            )
        if scope == "mine_active":
            return Tournament.objects.filter(
                players__user=user, status__in=["running", "paused"]
            ).order_by("-created_at")
        if scope == "past":
            # A Spin n Go you played three of before breakfast is not history in
            # the sense this list means, and thirty of them would bury the night
            # somebody actually arranged. They are listed in their own tabs.
            return Tournament.objects.exclude(format__in=FAST_TOURNAMENT_FORMATS).filter(
                players__user=user, status="finished"
            ).order_by("-created_at")

        return super().get_queryset()

    def get_serializer_class(self):
        if self.request.method == "POST":
            return TournamentCreateSerializer
        return TournamentListSerializer


class TournamentDetailView(generics.RetrieveAPIView):
    queryset = Tournament.objects.all()
    serializer_class = TournamentDetailSerializer

    def get_queryset(self):
        _start_due_scheduled_tournaments()
        return super().get_queryset()


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def tournament_by_slug(request, slug):
    """One tournament, found by the readable half of its address.

    Old addresses lead here too. A rename gives a night a new slug and the old
    one is kept — a link in somebody's chat is not going to be corrected — so a
    retired slug answers with the tournament and the client puts the current
    address in the bar. The payload is the same one the number returns; nothing
    downstream needs to know which door it came through.
    """
    _start_due_scheduled_tournaments()
    row = (
        TournamentSlug.objects.filter(slug=slug)
        .select_related("tournament").first()
    )
    if row is None:
        return Response({"error": "No such tournament"}, status=status.HTTP_404_NOT_FOUND)
    return Response(TournamentDetailSerializer(
        row.tournament, context={"request": request},
    ).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def join_tournament(request, pk):
    try:
        tournament = Tournament.objects.get(pk=pk)
    except Tournament.DoesNotExist:
        return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

    if tournament.format in FAST_TOURNAMENT_FORMATS:
        # A seat here is bought at a tier, not joined at a tournament, and the
        # tier endpoint is the only thing that may open the queue or fire it.
        return Response(
            {"error": "Sit at this game from its own tab"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if tournament.players.filter(user=request.user).exists():
        return Response({"error": "Already joined"}, status=status.HTTP_400_BAD_REQUEST)

    if tournament.players.count() >= tournament.max_players:
        return Response({"error": "Tournament is full"}, status=status.HTTP_400_BAD_REQUEST)

    if tournament.status == "lobby":
        # Normal pre-start join
        pass
    elif tournament.status in ("running", "paused") and tournament.late_reg_level > 0:
        # Late registration — check current level from runner
        runner = _tournament_runners.get(pk)
        if runner is None:
            return Response({"error": "Tournament engine not running"}, status=status.HTTP_400_BAD_REQUEST)
        if runner.current_blind_level_number > tournament.late_reg_level:
            return Response({"error": "Late registration is closed"}, status=status.HTTP_400_BAD_REQUEST)
    else:
        return Response({"error": "Tournament already started"}, status=status.HTTP_400_BAD_REQUEST)

    # A coin tournament is played for the app's own currency, so the buy-in is
    # actually taken here rather than written down for later. Charged before the
    # seat exists: a seat nobody paid for is chips in the prize pool from nowhere.
    if not charge_entry(request.user, tournament):
        return Response({"error": "Not enough coins"}, status=status.HTTP_400_BAD_REQUEST)

    taken_seats = set(tournament.players.values_list("seat", flat=True))
    # Drawn rather than counted off from zero. The lowest free number is the one
    # that just came free, so somebody who left and came back was handed their
    # own chair straight back — see tournaments/seating.py.
    next_seat = pick_free_seat(taken_seats, tournament.max_players)
    if next_seat is None:
        return Response({"error": "Tournament is full"}, status=status.HTTP_400_BAD_REQUEST)
    table, seat_at_table = _get_table_assignment(tournament, next_seat)

    tp = TournamentPlayer.objects.create(
        tournament=tournament, user=request.user,
        table=table, seat=next_seat, seat_at_table=seat_at_table, chips=tournament.starting_chips,
        time_bank_seconds_remaining=tournament.time_bank_seconds,
        bounty_cents=starting_bounty_cents(BountyConfig.from_tournament(tournament)),
    )
    # One more in the field can be one more place paid — see payoutbank.py. A
    # share of the field is only a share of the field if it follows it.
    refresh_payouts(tournament)
    _start_due_scheduled_tournaments()
    return Response(
        {
            "seat": tp.seat,
            "table_id": tp.table_id,
            "table_number": tp.table.table_number if tp.table_id else None,
            "seat_at_table": tp.seat_at_table,
            "chips": tp.chips,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def start_tournament(request, pk):
    tournament = manageable_tournament(request.user, pk)
    if tournament is None:
        return Response({"error": "Not found or not yours to run"}, status=status.HTTP_404_NOT_FOUND)

    if tournament.status != "lobby":
        return Response({"error": "Tournament already started"}, status=status.HTTP_400_BAD_REQUEST)

    if tournament.players.count() < 2:
        return Response({"error": "Need at least 2 players"}, status=status.HTTP_400_BAD_REQUEST)

    if tournament.scheduled_start_at and tournament.scheduled_start_at > timezone.now():
        return Response(
            {
                "error": "Tournament is scheduled to start later",
                "scheduled_start_at": tournament.scheduled_start_at,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    tournament.status = "running"
    # Stamped once, on the way out of the lobby: resuming from a pause is not
    # starting again, and would otherwise reset how long this has been running.
    tournament.started_at = timezone.now()
    tournament.save(update_fields=["status", "started_at"])
    # The host pressed a button; everybody else has to be told. Whoever is
    # already looking at the table drops the alert themselves.
    announce_start(tournament)
    return Response({"status": "running"})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def pause_tournament(request, pk):
    tournament = manageable_tournament(request.user, pk)
    if tournament is None:
        return Response({"error": "Not found or not yours to run"}, status=status.HTTP_404_NOT_FOUND)

    if tournament.status != "running":
        return Response({"error": "Tournament is not running"}, status=status.HTTP_400_BAD_REQUEST)

    runner = _tournament_runners.get(pk)
    if runner is not None:
        async_to_sync(runner.pause)()

    tournament.status = "paused"
    tournament.save(update_fields=["status"])
    return Response({"status": "paused"})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def resume_tournament(request, pk):
    tournament = manageable_tournament(request.user, pk)
    if tournament is None:
        return Response({"error": "Not found or not yours to run"}, status=status.HTTP_404_NOT_FOUND)

    if tournament.status != "paused":
        return Response({"error": "Tournament is not paused"}, status=status.HTTP_400_BAD_REQUEST)

    tournament.status = "running"
    tournament.save(update_fields=["status"])

    runner = _tournament_runners.get(pk)
    if runner is not None:
        async_to_sync(runner.resume)()

    return Response({"status": "running"})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def skip_blind_level(request, pk):
    tournament = manageable_tournament(request.user, pk)
    if tournament is None:
        return Response({"error": "Not found or not yours to run"}, status=status.HTTP_404_NOT_FOUND)

    if tournament.status not in ("running", "paused"):
        return Response({"error": "Tournament is not running"}, status=status.HTTP_400_BAD_REQUEST)

    runner = _tournament_runners.get(pk)
    if runner is None:
        return Response({"error": "Tournament engine not running"}, status=status.HTTP_400_BAD_REQUEST)

    level = async_to_sync(runner.skip_level)()
    return Response({"status": tournament.status, "level": level})


@api_view(["GET", "PUT"])
@permission_classes([permissions.IsAuthenticated])
def blind_levels(request, pk):
    try:
        tournament = Tournament.objects.get(pk=pk)
    except Tournament.DoesNotExist:
        return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        levels = tournament.levels.all()
        return Response(BlindLevelSerializer(levels, many=True).data)

    # PUT — replace the whole structure, before the first hand. Whoever may run
    # the tournament may shape it: the host, the club's organisers, and the
    # superuser. This asked for the host alone, which left a co-organiser able
    # to start a tournament they could not fix a typo in.
    if not can_manage_tournament(request.user, tournament):
        return Response(
            {"error": "Only the host can edit this tournament"},
            status=status.HTTP_403_FORBIDDEN,
        )
    if tournament.status != "lobby":
        return Response({"error": "Cannot edit after start"}, status=status.HTTP_400_BAD_REQUEST)

    serializer = BlindLevelSerializer(data=request.data, many=True)
    serializer.is_valid(raise_exception=True)

    tournament.levels.all().delete()
    for i, lvl in enumerate(serializer.validated_data, 1):
        lvl["level_number"] = i
        lvl = {
            **lvl,
            "small_blind": 0 if lvl.get("is_break") else lvl["small_blind"],
            "big_blind": 0 if lvl.get("is_break") else lvl["big_blind"],
            "ante": 0 if lvl.get("is_break") else lvl.get("ante", 0),
            "duration_hands": None if lvl.get("is_break") else lvl.get("duration_hands"),
        }
        BlindLevel.objects.create(tournament=tournament, **lvl)

    return Response(BlindLevelSerializer(tournament.levels.all(), many=True).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def rebuy_tournament(request, pk):
    try:
        tournament = Tournament.objects.get(pk=pk)
    except Tournament.DoesNotExist:
        return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

    if tournament.status not in ("running", "paused"):
        return Response({"error": "Tournament is not running"}, status=status.HTTP_400_BAD_REQUEST)

    if not tournament.allow_rebuys:
        return Response({"error": "Rebuys are not allowed"}, status=status.HTTP_400_BAD_REQUEST)

    runner = _tournament_runners.get(pk)
    if runner is None:
        return Response({"error": "Tournament engine not running"}, status=status.HTTP_400_BAD_REQUEST)

    # The same predicate the lobby is served, so a button that is offered is a
    # button that works.
    if not rebuys_open(tournament):
        return Response({"error": "Rebuy period has ended"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        tp = TournamentPlayer.objects.get(tournament=tournament, user=request.user)
    except TournamentPlayer.DoesNotExist:
        return Response({"error": "You are not in this tournament"}, status=status.HTTP_400_BAD_REQUEST)

    if not tp.is_eliminated:
        return Response({"error": "You are not eliminated"}, status=status.HTTP_400_BAD_REQUEST)

    if tournament.max_rebuys is not None and tp.rebuy_count >= tournament.max_rebuys:
        return Response({"error": "No rebuys remaining"}, status=status.HTTP_400_BAD_REQUEST)

    # A rebuy is another buy-in, and in a coin game that is another debit. Taken
    # before the engine hands the chips over, since the engine's word on the
    # stack is final and there is no taking them back afterwards.
    if not charge_entry(request.user, tournament):
        return Response({"error": "Not enough coins"}, status=status.HTTP_400_BAD_REQUEST)

    # The engine holds its players in memory and writes them over the DB after
    # every hand, so the rebuy has to land there or it is silently undone. This
    # call must stay outside any atomic block: it bridges into async and opens
    # its own connections, which closes the one the transaction is holding.
    # apply_rebuy persists chips and is_eliminated itself.
    refusal = async_to_sync(runner.apply_rebuy)(request.user.id, tournament.starting_chips)
    if refusal:
        # The engine would not take them back — the tournament is finishing, or
        # the window closed while this was in flight — so the coins charged
        # above bought nothing and go back.
        refund_entry(request.user, tournament)
        return Response({"error": refusal}, status=status.HTTP_400_BAD_REQUEST)

    # Only the bookkeeping the engine doesn't own is left to write here.
    with transaction.atomic():
        TournamentPlayer.objects.filter(pk=tp.pk).update(
            finish_position=None,
            rebuy_count=F("rebuy_count") + 1,
        )
    tp.refresh_from_db()

    return Response({"seat": tp.seat, "chips": tp.chips, "rebuy_count": tp.rebuy_count})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def quit_tournament(request, pk):
    try:
        tournament = Tournament.objects.get(pk=pk)
    except Tournament.DoesNotExist:
        return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

    if tournament.format in FAST_TOURNAMENT_FORMATS:
        # Leaving a queue also decides what happens to the queue, so it has its
        # own endpoint rather than a special case in this one.
        return Response(
            {"error": "Leave this game from its own tab"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Once cards are in the air a seat carries chips that belong to the prize
    # pool, so it can only be given up before the tournament starts.
    if tournament.status != "lobby":
        return Response(
            {"error": "Cannot leave a tournament that has already started"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # The host may give up their seat like anybody else. Hosting and playing
    # are two different things that this used to treat as one: opening a
    # tournament seats you automatically, and somebody who arranges a night
    # they then cannot play was stuck in it — with no way out that was not
    # deleting the night for everybody.
    #
    # Nobody is stranded by it. What lets a tournament be started is the host
    # FK on the row, not a seat in the field, and that stays exactly where it
    # was; the host can still start it, edit it and pause it from a chair by
    # the wall.

    try:
        tp = TournamentPlayer.objects.get(tournament=tournament, user=request.user)
    except TournamentPlayer.DoesNotExist:
        return Response({"error": "You are not in this tournament"}, status=status.HTTP_400_BAD_REQUEST)

    tp.delete()
    # Nothing was played, so a coin buy-in goes back where it came from.
    refund_entry(request.user, tournament)
    # And the field is one smaller, which can be one place fewer.
    refresh_payouts(tournament)
    return Response({"status": "unregistered"})


@api_view(["PATCH"])
@permission_classes([permissions.IsAuthenticated])
def update_tournament(request, pk):
    """Let the host fix a tournament nobody has played yet.

    Only in the lobby: once the first hand is dealt the structure is what the
    play happened under, and editing it rewrites history rather than plans.

    The money is not editable at all, even here. The buy-in, what it pays and
    what a head is worth are the terms players joined on, and changing those
    behind them is a different thing from moving the start time.
    """
    tournament = manageable_tournament(request.user, pk)
    if tournament is None:
        return Response({"error": "Not found or not yours to run"}, status=status.HTTP_404_NOT_FOUND)

    if tournament.status != "lobby":
        return Response(
            {"error": "Only a tournament that has not started can be edited"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = TournamentUpdateSerializer(
        tournament, data=request.data, partial=True, context={"request": request},
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(TournamentDetailSerializer(tournament, context={"request": request}).data)


@api_view(["DELETE"])
@permission_classes([permissions.IsAuthenticated])
def delete_tournament(request, pk):
    """Let the host discard a tournament that is not being played.

    Before the first hand, or while paused. A paused tournament is one the host
    has already stopped, and a night that breaks up half way through should not
    leave a game nobody can get rid of. A running one is still refused: players
    are in hands, and the rows would go out from under them.

    Deleting a paused tournament takes its hand history with it. Nothing owed is
    lost — the ledger is only written when a tournament finishes — but the hands
    that were played are gone, which is why this is the host's call and nobody
    else's.
    """
    tournament = manageable_tournament(request.user, pk)
    if tournament is None:
        return Response({"error": "Not found or not yours to run"}, status=status.HTTP_404_NOT_FOUND)

    if tournament.status not in ("lobby", "paused"):
        return Response(
            {"error": "Only a tournament in the lobby or paused can be deleted"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if tournament.status == "paused":
        # The engine is alive and waiting to be resumed. Stop it before the
        # rows go, or it wakes up and writes to a tournament that is not there.
        stop_tournament_engine(pk)
    elif pk in _tournament_runners:
        # An engine should never be running for a lobby tournament, but if one
        # is, deleting the rows from under it would leave it writing to nothing.
        return Response(
            {"error": "Tournament is still running"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    tournament.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST", "DELETE"])
@permission_classes([permissions.IsAuthenticated])
def repeat_tournament(request, pk):
    """Make this night a weekly series, or stop the series it belongs to.

    POST turns the game into the first of a series: same weekday, same hour,
    same everything, opened a few days ahead every week from now on. DELETE
    stops it coming round — what it has already opened stays open, because
    people have registered for those.

    Whoever may run the tournament may do this: it is the same decision as
    scheduling it, made once instead of every week.
    """
    tournament = manageable_tournament(request.user, pk)
    if tournament is None:
        return Response({"error": "Not found or not yours to run"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        if tournament.fixture is None:
            return Response({"error": "This is not part of a series"}, status=status.HTTP_400_BAD_REQUEST)
        stop_series(tournament.fixture)
        return Response({"repeats": None})

    # Which clock the hour is on, from the browser that asked. A wall clock
    # with no wall is the server's, which keeps its clocks on UTC — that is
    # right for storing a moment and wrong for "every Friday at nine".
    made = start_series(
        tournament, request.data.get("days_ahead"), request.data.get("timezone"),
    )
    if isinstance(made, str):
        return Response({"error": made}, status=status.HTTP_400_BAD_REQUEST)

    return Response({
        "repeats": {
            "id": made.id,
            "label": describe_fixture(made.weekday, made.start_time),
            "days_ahead": made.days_ahead,
        },
    }, status=status.HTTP_201_CREATED)
