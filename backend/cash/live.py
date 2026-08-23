"""The cash tables that are actually running, and the socket they run on.

This is the join between the loop in room.py and everything outside it: the
database rows it reads its seats from, the channel groups it broadcasts to, and
the players' sockets it asks for decisions.

It borrows the tournament's machinery rather than building a second one. The
action request, the timer, the pending-action registry that survives a reload,
the per-table channel group — all of it is keyed on a room id and a table
number, and nothing in it cares whether the id belongs to a tournament. So a
cash table is the room `cash-7`, and the rest works unchanged.

Module state, like the tournament runners beside it, and for the same stated
reason: entrypoint.sh runs one process on purpose.
"""

import asyncio
from typing import Dict

from asgiref.sync import async_to_sync, sync_to_async
from django.utils import timezone

from accounts.avatars import avatar_url
from game.consumers import _broadcast_table, _notify_user, _request_action

from .bank import stand_up
from .models import CashHand, CashHandSeat, CashSeat, CashTable
from .room import CashRoom
from .stakes import stake_for

# table id -> the loop dealing it
_rooms: Dict[int, CashRoom] = {}
_tasks: Dict[int, asyncio.Task] = {}


def room_id(table_id) -> str:
    """The namespace a cash table lives in.

    A string, so it can never collide with a tournament id in the registries
    the two share — and readable in a log, which the group names end up in.
    """
    return f"cash-{table_id}"


def running_room(table_id):
    return _rooms.get(int(table_id))


def seat_rows(table_id):
    """Every seat at the table, as the loop and the sockets want them.

    Read fresh between hands rather than held: this is the moment joins,
    leaves, top-ups and sit-outs all take effect, and reading them from the
    rows is what makes that one moment rather than four.

    One definition, because there are three callers — the loop, the snapshot a
    socket gets on arrival, and the announcement when a seat fills. When there
    were three copies, the faces were added to none of them.
    """
    rows = (
        CashSeat.objects
        .filter(table_id=table_id)
        .select_related("user", "user__profile", "user__avatar_image")
        .order_by("seat")
    )
    seats = []
    for row in rows:
        profile = getattr(row.user, "profile", None)
        image = getattr(row.user, "avatar_image", None)
        seats.append({
            "seat": row.seat,
            "user_id": row.user_id,
            "name": (getattr(profile, "display_name", "") or row.user.username),
            "stack": row.stack,
            "sitting_out": row.sitting_out,
            "leaving": row.leaving,
            # The face. A cash table draws the same seats as a tournament and
            # off the same fields, so somebody who has picked a picture and a
            # ring is the same person in both rooms.
            "avatar": (getattr(profile, "avatar_emoji", "") or "\U0001F0CF"),
            "avatar_border": (getattr(profile, "avatar_border", "") or ""),
            "avatar_url": avatar_url(row.user_id, image.updated_at if image else None),
        })
    return seats


_load_seats = sync_to_async(seat_rows)


@sync_to_async
def _persist_stacks(table_id, stacks):
    """What everybody is left with, written down before anything else happens.

    These are coins. A stack that only exists in memory is a stack that a
    restart turns into somebody's loss.
    """
    for seat, chips in stacks.items():
        CashSeat.objects.filter(table_id=table_id, seat=seat).update(
            stack=max(0, int(chips)),
        )


@sync_to_async
def _settle_leavers(table_id):
    """Pay out anybody who asked to go, and sit out anybody with nothing left.

    Both between hands, which is the only safe moment: a seat cashed out in the
    middle of a hand is a pot with a hole in it.
    """
    for seat in CashSeat.objects.filter(table_id=table_id, leaving=True).select_related("user"):
        stand_up(seat)
    CashSeat.objects.filter(table_id=table_id, stack__lte=0).update(sitting_out=True)


@sync_to_async
def _record_hand(table_id, row):
    hand = CashHand.objects.create(
        table_id=table_id,
        hand_number=row["hand_number"],
        pot=row["pot"],
        awards=row["awards"],
        boards=row["boards"],
        was_bomb_pot=row["was_bomb_pot"],
        ran_twice=row["ran_twice"],
    )
    # And what it did to each of them. Written with the hand's own moment on
    # it, so a week of somebody's cash play is one query over one index.
    CashHandSeat.objects.bulk_create([
        CashHandSeat(
            hand=hand, user_id=seat["user_id"], seat=seat["seat"],
            net=seat["net"], won=seat["won"], played_at=hand.played_at,
        )
        for seat in row.get("seats", [])
        if seat.get("user_id")
    ])
    CashTable.objects.filter(id=table_id).update(
        hands_played=row["hand_number"], last_hand_at=timezone.now(),
    )


# The two events that are not everybody's business. The engine broadcasts them
# with every player's cards in one payload and leaves the delivery to whoever
# is driving it — a tournament's coordinator splits them up and posts each
# player their own. A cash table had nothing doing that, so every seat was
# being sent the whole table's hole cards. Nothing drew them, which is exactly
# what made it easy to miss: they were in the payload, and anybody with the
# console open could read the table.
PRIVATE_EVENTS = {
    "hole_cards_dealt": lambda row: {"type": "hole_cards", "cards": row["cards"]},
    "hand_strength_dealt": lambda row: {"type": "hand_strength", "text": row["text"]},
}


async def _deliver(table_id, event_type, payload):
    """One event off the table, to everybody or to one person.

    A spectator is a socket in the group with nobody's user id against it, so
    the private ones simply never reach the rail — which is the whole of what
    watching a cash table is allowed to be.
    """
    private = PRIVATE_EVENTS.get(event_type)
    if private is None:
        await _broadcast_table(room_id(table_id), 1, event_type, payload)
        return
    for row in (payload or {}).get("players", []):
        user_id = row.get("user_id")
        if user_id is not None:
            await _notify_user(room_id(table_id), user_id, private(row))


@sync_to_async
def _table_row(table_id):
    return CashTable.objects.filter(id=table_id, is_open=True).first()


async def ensure_room(table_id):
    """The loop for this table, started if it is not already running.

    Booted by the first socket to arrive rather than by anything on a schedule,
    exactly like a tournament's engine: a table nobody is looking at has nothing
    to deal.
    """
    table_id = int(table_id)
    existing = _rooms.get(table_id)
    if existing is not None and existing.running:
        return existing

    table = await _table_row(table_id)
    if table is None:
        return None
    stake = stake_for(table.stake)
    if stake is None:
        return None

    room = CashRoom(
        table_id=table_id,
        stake=stake,
        seat_count=table.seat_count,
        load_seats=lambda: _load_seats(table_id),
        persist_stacks=lambda stacks: _persist_stacks(table_id, stacks),
        settle_leavers=lambda: _settle_leavers(table_id),
        broadcast=lambda event_type, payload: _deliver(table_id, event_type, payload),
        request_action=lambda player, context: _request_action(
            room_id(table_id), 1, player, context,
        ),
        record_hand=lambda row: _record_hand(table_id, row),
        run_it_twice=table.run_it_twice,
        bomb_pot_every=table.bomb_pot_every,
        bomb_pot_bb=table.bomb_pot_bb,
        rabbit_hunting=table.rabbit_hunting,
    )
    # Where the hand count picks up, so a table restarted mid-session does not
    # deal hand one again — and does not deal a bomb pot the moment it comes
    # back, which is when nobody has their bearings.
    room.hand_number = table.hands_played
    _rooms[table_id] = room
    _tasks[table_id] = asyncio.create_task(room.run())
    return room


def announce_seats(table_id) -> bool:
    """Tell everybody at the table who is sitting at it now.

    Called from the REST views, which is where seats actually change. Only
    between hands: a snapshot of the seats is a snapshot without bets, cards or
    a pot in it, and sending one mid-hand would wipe the hand off everybody's
    screen. During a hand there is nothing to do — the next one opens with the
    same snapshot anyway.
    """
    room = _rooms.get(int(table_id))
    if room is None or room._playing:
        return False
    rows = seat_rows(table_id)
    async_to_sync(_broadcast_table)(
        room_id(table_id), 1, "cash_state", room.snapshot(rows),
    )
    return True


def stop_room(table_id):
    """Stop dealing. The hand in progress finishes; nothing follows it."""
    table_id = int(table_id)
    room = _rooms.pop(table_id, None)
    if room is not None:
        room.stop()
    task = _tasks.pop(table_id, None)
    if task is not None:
        task.cancel()
    return room is not None
