"""The lobby of cash tables, and the ways in and out of one.

Everything a player does to a table that is not playing a hand: read the list,
open one in a club, sit down, top up, sit out, and leave with the chips.

The hands themselves are the socket's business (see consumers.py). What is here
is money and rows, which is why it is all REST and all transactional.
"""

from django.db import transaction
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.naming import shown_name
from clubs.permissions import is_club_staff
from sidegames.economy import wallet_for

from .bank import cash_out_everybody, sit_down, stand_up, top_up
from .live import announce_seats, running_room, stop_room
from .models import CashSeat, CashTable
from .seating import next_free_seat
from .stakes import STAKES, SEAT_CHOICES, clean_seats, stake_for, top_up_room


def table_payload(table, seats=None, me=None):
    """One table, as the lobby draws it."""
    stake = stake_for(table.stake)
    rows = list(seats if seats is not None else table.taken.select_related("user", "user__profile"))
    return {
        "id": table.id,
        "name": table.name,
        "stake": table.stake,
        "stake_label": stake.label if stake else table.stake,
        "small_blind": stake.small_blind if stake else 0,
        "big_blind": stake.big_blind if stake else 0,
        "min_buy_in": stake.min_buy_in if stake else 0,
        "max_buy_in": stake.max_buy_in if stake else 0,
        "seats": table.seat_count,
        "taken": len(rows),
        "club": table.club_id,
        "club_name": table.club.name if table.club_id else None,
        "run_it_twice": table.run_it_twice,
        "bomb_pot_every": table.bomb_pot_every,
        "bomb_pot_bb": table.bomb_pot_bb,
        "hands_played": table.hands_played,
        "is_open": table.is_open,
        # What a lobby row is actually scanned for: is there a game here, and
        # is one of these seats mine.
        "average_stack": (sum(row.stack for row in rows) // len(rows)) if rows else 0,
        "players": [
            {
                "seat": row.seat,
                "username": row.user.username,
                "display_name": shown_name(
                    row.user.username,
                    getattr(getattr(row.user, "profile", None), "display_name", ""),
                ),
                "stack": row.stack,
                "sitting_out": row.sitting_out,
            }
            for row in sorted(rows, key=lambda one: one.seat)
        ],
        "my_seat": next(
            (row.seat for row in rows if me is not None and row.user_id == me.id), None,
        ),
    }


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def lobby(request):
    """Every open table, and the ladder they sit on."""
    tables = (
        CashTable.objects.filter(is_open=True)
        .select_related("club")
        .prefetch_related("taken__user__profile")
        .order_by("stake", "-hands_played", "id")
    )
    club = request.query_params.get("club")
    if club:
        tables = tables.filter(club__slug=club)

    return Response({
        "stakes": [
            {
                "key": one.key,
                "label": one.label,
                "small_blind": one.small_blind,
                "big_blind": one.big_blind,
                "min_buy_in": one.min_buy_in,
                "max_buy_in": one.max_buy_in,
            }
            for one in STAKES
        ],
        "seat_choices": list(SEAT_CHOICES),
        "tables": [table_payload(one, me=request.user) for one in tables],
        "balance": wallet_for(request.user).balance,
    })


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def table_detail(request, pk):
    table = CashTable.objects.filter(pk=pk).select_related("club").first()
    if table is None:
        return Response({"error": "No such table"}, status=status.HTTP_404_NOT_FOUND)
    return Response(table_payload(table, me=request.user))


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def open_table(request):
    """Open a table. Inside a club, for anybody who helps run it.

    The public tables are the app's own and are not opened this way; a club's
    are the club's, and the same stake ladder governs both — which is what
    keeps a club night and the public tables the same game.
    """
    stake = stake_for(request.data.get("stake"))
    if stake is None:
        return Response({"error": "Pick a stake"}, status=status.HTTP_400_BAD_REQUEST)

    club = None
    slug = request.data.get("club")
    if slug:
        from clubs.models import Club

        club = Club.objects.filter(slug=slug).first()
        if club is None:
            return Response({"error": "No such club"}, status=status.HTTP_404_NOT_FOUND)
        if not is_club_staff(request.user, club):
            return Response(
                {"error": "You do not organise for that club."},
                status=status.HTTP_403_FORBIDDEN,
            )
    elif not (request.user.is_staff or request.user.is_superuser):
        # A public table is the app's own. Anybody may open one inside a club
        # they run, which is where a private game belongs.
        return Response(
            {"error": "Open a table inside one of your clubs."},
            status=status.HTTP_403_FORBIDDEN,
        )

    name = str(request.data.get("name") or "").strip()[:60]
    table = CashTable.objects.create(
        name=name or f"{stake.label} {clean_seats(request.data.get('seats'))}-max",
        stake=stake.key,
        seat_count=clean_seats(request.data.get("seats")),
        club=club,
        created_by=request.user,
        run_it_twice=bool(request.data.get("run_it_twice")),
        bomb_pot_every=max(0, min(100, int(request.data.get("bomb_pot_every") or 0))),
        bomb_pot_bb=max(1, min(10, int(request.data.get("bomb_pot_bb") or 2))),
    )
    return Response(table_payload(table, me=request.user), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def sit(request, pk):
    """Take a seat, with coins off the wallet and onto the felt."""
    table = CashTable.objects.filter(pk=pk).first()
    if table is None:
        return Response({"error": "No such table"}, status=status.HTTP_404_NOT_FOUND)

    with transaction.atomic():
        taken = list(
            CashSeat.objects.select_for_update().filter(table=table).values_list("seat", flat=True)
        )
        asked = request.data.get("seat")
        if asked is None or asked == "":
            seat_number = next_free_seat(taken, table.seat_count)
        else:
            try:
                seat_number = int(asked)
            except (TypeError, ValueError):
                return Response({"error": "That is not a seat"},
                                status=status.HTTP_400_BAD_REQUEST)
        if seat_number is None:
            return Response({"error": "That table is full"}, status=status.HTTP_400_BAD_REQUEST)
        if not 0 <= seat_number < table.seat_count:
            return Response({"error": "There is no such seat here"},
                            status=status.HTTP_400_BAD_REQUEST)
        # Somebody sat there while this player was choosing, which is the whole
        # reason the row lock above is held across the check.
        if seat_number in taken:
            return Response({"error": "Somebody just took that seat"},
                            status=status.HTTP_400_BAD_REQUEST)

        seated = sit_down(table, request.user, request.data.get("buy_in"), seat_number)
    if isinstance(seated, str):
        return Response({"error": seated}, status=status.HTTP_400_BAD_REQUEST)

    # Everybody at the table, including whoever is watching from the rail, sees
    # the chair fill. Between hands only; mid-hand the next one carries it.
    announce_seats(table.id)

    return Response({
        "seat": seated.seat,
        "stack": seated.stack,
        "balance": wallet_for(request.user).balance,
        "table": table_payload(table, me=request.user),
    }, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def add_chips(request, pk):
    """Bring more coins to a stack you already have."""
    seat = CashSeat.objects.filter(table_id=pk, user=request.user).select_related("table").first()
    if seat is None:
        return Response({"error": "You are not at that table"}, status=status.HTTP_400_BAD_REQUEST)

    topped = top_up(seat, request.data.get("amount"))
    if isinstance(topped, str):
        return Response({"error": topped}, status=status.HTTP_400_BAD_REQUEST)

    stake = stake_for(seat.table.stake)
    return Response({
        "stack": topped.stack,
        "room": top_up_room(stake, topped.stack) if stake else 0,
        "balance": wallet_for(request.user).balance,
    })


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def sit_out(request, pk):
    """Stop being dealt in, without giving the seat up."""
    seat = CashSeat.objects.filter(table_id=pk, user=request.user).first()
    if seat is None:
        return Response({"error": "You are not at that table"}, status=status.HTTP_400_BAD_REQUEST)

    seat.sitting_out = bool(request.data.get("value", True))
    seat.save(update_fields=["sitting_out"])
    return Response({"sitting_out": seat.sitting_out})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def leave(request, pk):
    """Leave, and take the stack.

    Between hands, always. A player in a hand is marked as leaving and the room
    pays them out the moment it ends — a seat cashed out mid-hand is a pot with
    a hole in it.
    """
    seat = CashSeat.objects.filter(table_id=pk, user=request.user).select_related("table").first()
    if seat is None:
        return Response({"error": "You are not at that table"}, status=status.HTTP_400_BAD_REQUEST)

    room = running_room(pk)
    in_a_hand = room is not None and room.player_at(request.user.id) is not None
    if in_a_hand:
        CashSeat.objects.filter(pk=seat.pk).update(leaving=True, sitting_out=True)
        return Response({"leaving": True, "balance": wallet_for(request.user).balance})

    paid = stand_up(seat)
    announce_seats(pk)
    return Response({
        "leaving": False,
        "cashed_out": paid,
        "balance": wallet_for(request.user).balance,
    })


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def close_table(request, pk):
    """Shut a table and pay everybody back what is in front of them."""
    table = CashTable.objects.filter(pk=pk).select_related("club").first()
    if table is None:
        return Response({"error": "No such table"}, status=status.HTTP_404_NOT_FOUND)

    allowed = request.user.is_superuser or table.created_by_id == request.user.id
    if not allowed and table.club_id:
        allowed = is_club_staff(request.user, table.club)
    if not allowed:
        return Response({"error": "Not yours to close"}, status=status.HTTP_403_FORBIDDEN)

    stop_room(table.id)
    paid = cash_out_everybody(table)
    table.is_open = False
    table.save(update_fields=["is_open"])
    return Response({"closed": True, "paid_out": paid})
