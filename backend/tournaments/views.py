from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .models import Tournament, TournamentPlayer, BlindLevel
from .serializers import (
    TournamentListSerializer,
    TournamentDetailSerializer,
    TournamentCreateSerializer,
    BlindLevelSerializer,
)

# Import shared runner reference from consumers (will be populated at runtime)
from game.consumers import _tournament_runners


def _get_table_assignment(tournament, global_seat):
    table_number = (global_seat // tournament.players_per_table) + 1
    seat_at_table = global_seat % tournament.players_per_table
    table = tournament.ensure_table(table_number)
    return table, seat_at_table


class TournamentListCreateView(generics.ListCreateAPIView):
    queryset = Tournament.objects.all().order_by("-created_at")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return TournamentCreateSerializer
        return TournamentListSerializer


class TournamentDetailView(generics.RetrieveAPIView):
    queryset = Tournament.objects.all()
    serializer_class = TournamentDetailSerializer


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
    elif tournament.status == "running" and tournament.late_reg_level > 0:
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
    )
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

    tournament.status = "running"
    tournament.save()
    return Response({"status": "running"})


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

    if tournament.status != "running":
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

    tp.is_eliminated = False
    tp.chips = tournament.starting_chips
    tp.rebuy_count += 1
    tp.save()

    return Response({"seat": tp.seat, "chips": tp.chips, "rebuy_count": tp.rebuy_count})
