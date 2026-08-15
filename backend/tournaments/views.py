from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from asgiref.sync import async_to_sync
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from .bounties import BountyConfig, starting_bounty_cents
from .models import Tournament, TournamentPlayer, BlindLevel
from .permissions import StaffCreatesTournaments
from .serializers import (
    TournamentListSerializer,
    TournamentDetailSerializer,
    TournamentCreateSerializer,
    BlindLevelSerializer,
)

# Import shared runner reference from consumers (will be populated at runtime)
from game.consumers import _tournament_runners, late_registration_open, stop_tournament_engine


def _start_due_scheduled_tournaments():
    due_tournaments = Tournament.objects.filter(
        status="lobby",
        scheduled_start_at__isnull=False,
        scheduled_start_at__lte=timezone.now(),
    )
    for tournament in due_tournaments:
        if tournament.players.count() >= 2:
            tournament.status = "running"
            tournament.save(update_fields=["status"])


def _get_table_assignment(tournament, global_seat):
    table_number = (global_seat // tournament.players_per_table) + 1
    seat_at_table = global_seat % tournament.players_per_table
    table = tournament.ensure_table(table_number)
    return table, seat_at_table


class TournamentListCreateView(generics.ListCreateAPIView):
    queryset = Tournament.objects.all().order_by("-created_at")
    permission_classes = [StaffCreatesTournaments]

    def get_queryset(self):
        _start_due_scheduled_tournaments()
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
            return Tournament.objects.filter(
                Q(status="lobby") | Q(id__in=open_late_reg_ids)
            ).order_by(
                F("scheduled_start_at").asc(nulls_last=True), "-created_at"
            )
        if scope == "mine_active":
            return Tournament.objects.filter(
                players__user=user, status__in=["running", "paused"]
            ).order_by("-created_at")
        if scope == "past":
            return Tournament.objects.filter(
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


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def join_tournament(request, pk):
    try:
        tournament = Tournament.objects.get(pk=pk)
    except Tournament.DoesNotExist:
        return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

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

    taken_seats = set(tournament.players.values_list("seat", flat=True))
    next_seat = next(s for s in range(tournament.max_players) if s not in taken_seats)
    table, seat_at_table = _get_table_assignment(tournament, next_seat)

    tp = TournamentPlayer.objects.create(
        tournament=tournament, user=request.user,
        table=table, seat=next_seat, seat_at_table=seat_at_table, chips=tournament.starting_chips,
        time_bank_seconds_remaining=tournament.time_bank_seconds,
        bounty_cents=starting_bounty_cents(BountyConfig.from_tournament(tournament)),
    )
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
    try:
        tournament = Tournament.objects.get(pk=pk, host=request.user)
    except Tournament.DoesNotExist:
        return Response({"error": "Not found or not host"}, status=status.HTTP_404_NOT_FOUND)

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
    tournament.save()
    return Response({"status": "running"})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def pause_tournament(request, pk):
    try:
        tournament = Tournament.objects.get(pk=pk, host=request.user)
    except Tournament.DoesNotExist:
        return Response({"error": "Not found or not host"}, status=status.HTTP_404_NOT_FOUND)

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
    try:
        tournament = Tournament.objects.get(pk=pk, host=request.user)
    except Tournament.DoesNotExist:
        return Response({"error": "Not found or not host"}, status=status.HTTP_404_NOT_FOUND)

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
    try:
        tournament = Tournament.objects.get(pk=pk, host=request.user)
    except Tournament.DoesNotExist:
        return Response({"error": "Not found or not host"}, status=status.HTTP_404_NOT_FOUND)

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

    # PUT — replace entire structure (host only, lobby only)
    if tournament.host != request.user:
        return Response({"error": "Only host can edit"}, status=status.HTTP_403_FORBIDDEN)
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

    if runner.current_blind_level_number > tournament.rebuy_level:
        return Response({"error": "Rebuy period has ended"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        tp = TournamentPlayer.objects.get(tournament=tournament, user=request.user)
    except TournamentPlayer.DoesNotExist:
        return Response({"error": "You are not in this tournament"}, status=status.HTTP_400_BAD_REQUEST)

    if not tp.is_eliminated:
        return Response({"error": "You are not eliminated"}, status=status.HTTP_400_BAD_REQUEST)

    if tp.rebuy_count >= tournament.max_rebuys:
        return Response({"error": "No rebuys remaining"}, status=status.HTTP_400_BAD_REQUEST)

    # The engine holds its players in memory and writes them over the DB after
    # every hand, so the rebuy has to land there or it is silently undone. This
    # call must stay outside any atomic block: it bridges into async and opens
    # its own connections, which closes the one the transaction is holding.
    # apply_rebuy persists chips and is_eliminated itself.
    refusal = async_to_sync(runner.apply_rebuy)(request.user.id, tournament.starting_chips)
    if refusal:
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

    # Once cards are in the air a seat carries chips that belong to the prize
    # pool, so it can only be given up before the tournament starts.
    if tournament.status != "lobby":
        return Response(
            {"error": "Cannot leave a tournament that has already started"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # The host owns the tournament and is the only one who can start it, so
    # leaving would strand everyone else in a lobby nobody can open.
    if tournament.host_id == request.user.id:
        return Response(
            {"error": "The host cannot leave their own tournament"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        tp = TournamentPlayer.objects.get(tournament=tournament, user=request.user)
    except TournamentPlayer.DoesNotExist:
        return Response({"error": "You are not in this tournament"}, status=status.HTTP_400_BAD_REQUEST)

    tp.delete()
    return Response({"status": "unregistered"})


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
    try:
        tournament = Tournament.objects.get(pk=pk, host=request.user)
    except Tournament.DoesNotExist:
        return Response({"error": "Not found or not host"}, status=status.HTTP_404_NOT_FOUND)

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
