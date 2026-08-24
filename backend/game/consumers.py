"""WebSocket consumer for live tournament play."""

from __future__ import annotations

import asyncio
import json
import math
import time
import traceback
from typing import Callable, Dict, Optional, Tuple
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.db import transaction
from django.db.models import Max
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.layers import get_channel_layer
from django.contrib.auth.models import AnonymousUser, User
from django.utils import timezone

from accounts.avatars import avatar_url
from accounts.naming import shown_name
from accounts.models import AvatarImage
from tournaments.bounties import BountyConfig
from tournaments.models import BlindLevel, Tournament, TournamentPlayer

from .models import Hand, HandAction

from .coordinator import MultiTableTournamentCoordinator, offline_sit_out_seconds
from .finishers import finisher_list
from .giphy import clean_gif_id as _clean_gif_id
from .away import truly_gone as _truly_gone
from .throwables import clean_item as _clean_item
from .throwlimit import check as _throw_check
from .throwables import is_free as _is_free_item


_game_tasks: Dict[int, asyncio.Task] = {}
_action_queues: Dict[Tuple[int, int], asyncio.Queue] = {}
_player_channels: Dict[Tuple[int, int], str] = {}
_tournament_runners: Dict[int, MultiTableTournamentCoordinator] = {}
# The decision a player currently owes, so a reconnect can be handed it back
# instead of silently timing out into a fold.
_pending_actions: Dict[Tuple[int, int], dict] = {}
# Who has a camera or microphone running, so a player arriving at a table knows
# who to call. Module state like _player_channels above: one process, one
# replica, which is what entrypoint.sh deliberately runs.
_media_presence: Dict[Tuple[int, int], dict] = {}

CHAT_MAX_CHARS = 240
CHAT_WINDOW_SECONDS = 10.0
CHAT_MESSAGE_BUDGET = 8

# Throwing is cheap to do and easy to overdo, and it lands on somebody else's
# screen rather than in a panel they can close — so it has a rule of its own,
# in throwlimit.py: a burst of three, then ten seconds of tired arm.

MEDIA_WINDOW_SECONDS = 10.0
MEDIA_MESSAGE_BUDGET = 120
MEDIA_SIGNAL_MAX_BYTES = 32_000


def _media_peers_at(tournament_id: int, table_number: int, exclude_user_id: int) -> list:
    """Who at this table currently has a camera or microphone running."""
    return [
        {"user_id": user_id, "audio": presence["audio"], "video": presence["video"]}
        for (tid, user_id), presence in _media_presence.items()
        if tid == tournament_id and presence["table"] == table_number and user_id != exclude_user_id
    ]


def late_registration_open(tournament) -> bool:
    # Only the live runner knows the current blind level, so a tournament whose
    # engine is not booted counts as closed — join_tournament rejects it anyway.
    if tournament.late_reg_level <= 0 or tournament.status not in ("running", "paused"):
        return False
    runner = _tournament_runners.get(tournament.id)
    if runner is None:
        return False
    return runner.current_blind_level_number <= tournament.late_reg_level


def late_registration_seconds_left(tournament):
    """How long is left to register, in seconds, or None if it cannot be said.

    "Until level 4" is a fact about the schedule; this is the one a player
    actually wants, and the only place that knows it is the running engine.
    """
    if not late_registration_open(tournament):
        return None
    runner = _tournament_runners.get(tournament.id)
    if runner is None:
        return None
    return runner.seconds_until_blind_level_ends(tournament.late_reg_level)


def rebuys_open(tournament) -> bool:
    """Can a busted player still buy back in right now?

    The same question the rebuy endpoint asks, so a lobby offering the button
    and a server accepting it never disagree. As with late registration, only
    the live runner knows the current blind level, so an engine that is not
    booted counts as closed — the endpoint refuses on those grounds anyway.
    """
    if not tournament.allow_rebuys or tournament.status not in ("running", "paused"):
        return False
    runner = _tournament_runners.get(tournament.id)
    if runner is None:
        return False
    return runner.current_blind_level_number <= tournament.rebuy_level


def current_level_index(tournament) -> int:
    """Which level the tournament is on, from the engine when there is one.

    The column is written after every hand, which is close enough for a page
    that reloads — but the runner is the one that just moved it, so it wins.
    """
    runner = _tournament_runners.get(tournament.id)
    if runner is None:
        return tournament.current_level_index
    return getattr(runner, "current_level_index", tournament.current_level_index)


def _app_is_open(user_id) -> bool:
    """Whether this player still has the app itself open.

    Imported where it is used rather than at the top: accounts imports from this
    module, and this is the edge that would close the loop.
    """
    from accounts.presence import is_online

    return is_online(user_id)


async def announce_gone(user_id) -> int:
    """Tell every table this player is sitting at that they have left.

    Awaited from the presence consumer, which is async — see
    accounts/consumers.py. Until there
    was a presence socket, the table socket closing was the only way anybody
    learnt this; now it is the other way round, because the table socket also
    closes when somebody walks to the lobby.

    Returns how many tables were told, which is what the tests read.
    """
    if _app_is_open(user_id):
        return 0

    told = 0
    for tournament_id, runner in list(_tournament_runners.items()):
        if (tournament_id, user_id) in _player_channels:
            continue   # still at that table, whatever the app is doing
        player = runner.get_runtime_player(user_id)
        if player is None:
            continue
        await _broadcast_table(
            tournament_id,
            player._table_number,
            "player_disconnected",
            {"seat": player._seat, "name": player.name},
        )
        told += 1
    return told


def connected_user_ids() -> set:
    """Everybody with a table socket open right now.

    Being registered for a running tournament is not the same as being there:
    a seat can sit disconnected for a whole level. This is the difference, read
    from the same registry the engine uses to deliver a player their turn.

    Module state, like the registries above — one process, one replica, which is
    what entrypoint.sh deliberately runs — so a REST view in this process can
    read it directly.
    """
    return {user_id for _tournament_id, user_id in _player_channels}


def stop_tournament_engine(tournament_id: int) -> bool:
    """Stop the engine for a tournament, called from outside the event loop.

    Cancelling is what `_run_tournament` treats as a shutdown rather than an
    ending: it leaves the tournament's status alone and clears both registries
    on its way out. Used when the host discards a paused tournament, where the
    engine is alive and waiting to be resumed.

    `Task.cancel` is not safe to call across threads, and the view calling this
    runs in a worker thread rather than on the loop the task belongs to, so the
    cancellation is handed to that loop to perform.
    """
    task = _game_tasks.get(tournament_id)
    had_engine = task is not None or tournament_id in _tournament_runners

    if task is not None:
        try:
            task.get_loop().call_soon_threadsafe(task.cancel)
        except RuntimeError:
            # The loop is already gone, so the task cannot still be running.
            pass

    # Cleared here as well as in the task's own teardown: the deletion that
    # follows must not race a registry that still names this tournament.
    _game_tasks.pop(tournament_id, None)
    _tournament_runners.pop(tournament_id, None)
    return had_engine


def fast_payload(tournament) -> Optional[dict]:
    """What kind of fast game this is and what it pays, or None for a tournament.

    Read off the row rather than worked out here: the multiplier was decided when
    the last player sat down, and the table is only reporting it. The table reads
    this to know which felt to lay — a two-handed game and a nine-handed one are
    not the same room — and to reveal the draw where there is one.
    """
    from tournaments.fastgames import FORMATS, key_for_tournament, pot_coins

    key = key_for_tournament(tournament)
    if key is None:
        return None

    fmt = FORMATS[key]
    stake = tournament.buy_in_coins or 0
    multiplier = tournament.spin_multiplier or 0
    return {
        "key": key,
        "label": fmt.label,
        "seats": fmt.seats,
        "stake_coins": stake,
        "multiplier": multiplier,
        "prize_coins": pot_coins(fmt, stake, fmt.seats, multiplier),
    }


def _tournament_group_name(tournament_id: int) -> str:
    return f"tournament_{tournament_id}"


def _table_group_name(tournament_id: int, table_number: int) -> str:
    return f"tournament_{tournament_id}_table_{table_number}"


async def _group_send(channel_layer, group, event_type, payload):
    if isinstance(payload, dict):
        msg = {"type": event_type, **payload}
    else:
        msg = {"type": event_type, "data": payload}
    await channel_layer.group_send(group, {"type": "game.message", "data": json.dumps(msg)})


@database_sync_to_async
def _db_set_tournament_status(tournament_id, status):
    fields = {"status": status}
    if status == "finished":
        # What "it took three hours" is measured against at the other end.
        fields["finished_at"] = timezone.now()
    Tournament.objects.filter(id=tournament_id).update(**fields)


@database_sync_to_async
def _db_open_mystery(tournament_id, draws):
    """Cut the mystery pool into envelopes and write them down.

    The pool is every entry's bounty, rebuys included and the entries of players
    who busted long before this moment included too — they paid for a bounty and
    it is in there. Counted here rather than in the engine because it is a
    question about rows, and because the row is where the answer has to end up.

    Idempotent: a pool already opened is returned as it stands rather than cut
    again, so two callers cannot mint two pools out of the same buy-ins.
    """
    from django.db import transaction

    from tournaments import mystery

    with transaction.atomic():
        tournament = Tournament.objects.select_for_update().filter(id=tournament_id).first()
        if tournament is None:
            return []
        if tournament.mystery_opened_at is not None:
            return list(tournament.mystery_envelopes or [])

        entries = sum(
            1 + (count or 0)
            for count in tournament.players.values_list("rebuy_count", flat=True)
        )
        pool = mystery.pool_cents(tournament.bounty_cents or 0, entries)
        envelopes = mystery.envelope_amounts(pool, draws)

        tournament.mystery_envelopes = envelopes
        # And what there ever was, written once and never touched again: the
        # difference between the two is what has been drawn, which is what the
        # board could not show.
        tournament.mystery_cut = list(envelopes)
        tournament.mystery_opened_at = timezone.now()
        tournament.save(update_fields=[
            "mystery_envelopes", "mystery_cut", "mystery_opened_at",
        ])
        return envelopes


@database_sync_to_async
def _db_persist_mystery(tournament_id, envelopes):
    """What is left in the pool after a draw. The row is the only copy."""
    Tournament.objects.filter(id=tournament_id).update(
        mystery_envelopes=[int(amount) for amount in envelopes],
    )


@database_sync_to_async
def _db_settle_tournament(tournament_id):
    """Work out who owes whom, now that the results are final.

    Two currencies, two settlements, and they do different things. The euro one
    only writes down what the night worked out to, for people to square up
    between themselves. The coin one actually pays the prizes into wallets.
    """
    from tournaments.coinbank import settle_finished_coins
    from tournaments.ledger import settle_finished

    recorded = settle_finished(tournament_id)
    paid = settle_finished_coins(tournament_id)
    return recorded or paid


@database_sync_to_async
def _db_owns_throwable(user_id, item):
    from django.contrib.auth import get_user_model
    from sidegames.shop import owns_throwable

    user = get_user_model().objects.filter(id=user_id).first()
    return user is not None and owns_throwable(user, item)


@database_sync_to_async
def _db_take_side_bet_stake(user_id, game_id, stake):
    """Take a side-game stake out of a wallet, or say it could not be paid."""
    from django.contrib.auth import get_user_model
    from sidegames.economy import spend

    user = get_user_model().objects.filter(id=user_id).first()
    if user is None:
        return False
    return spend(user, stake, "stake", memo=game_id) is not None


@database_sync_to_async
def _db_pay_side_bets(entries):
    """Pay the winning calls, and report everybody's balance afterwards.

    Losers are in the list too, with nothing to pay: their stake went when they
    called, and they still want to see what it left them with.
    """
    from django.contrib.auth import get_user_model
    from sidegames.economy import grant, wallet_for

    balances = {}
    users = get_user_model().objects.in_bulk([entry["user_id"] for entry in entries])
    for entry in entries:
        user = users.get(entry["user_id"])
        if user is None:
            continue
        if entry["returns"] > 0:
            wallet = grant(user, entry["returns"], "payout", memo=entry["game_id"])
        else:
            wallet = wallet_for(user)
        balances[entry["user_id"]] = wallet.balance
    return balances


@database_sync_to_async
def _db_get_tournament(tournament_id):
    try:
        return Tournament.objects.get(id=tournament_id)
    except Tournament.DoesNotExist:
        return None


@database_sync_to_async
def _db_save_hand(tournament_id, data):
    """Write a finished hand and its actions.

    Nothing wrote these tables before, so there was no hand history to review
    and the VPIP/PFR stats mined from them could only ever read zero.
    """
    hand = Hand.objects.create(
        tournament_id=tournament_id,
        hand_number=data["hand_number"],
        level_index=data["level_index"],
        dealer_seat=data["dealer_seat"],
        community_cards=data["community_cards"],
        pot_total=data["pot_total"],
        result=data["result"],
        status="complete",
    )
    HandAction.objects.bulk_create([
        HandAction(
            hand=hand,
            player_id=action["tp_id"],
            seat=action.get("seat"),
            street=action["street"],
            action=action["action"],
            amount=action["amount"] or 0,
        )
        for action in data["actions"]
        # A player moved off the table mid-hand has no row to attach to.
        if action.get("tp_id") is not None
    ])


@database_sync_to_async
def _db_set_progress(tournament_id, level_index, hands_in_level):
    Tournament.objects.filter(id=tournament_id).update(
        current_level_index=level_index, hands_in_level=hands_in_level,
    )


@database_sync_to_async
def _db_get_last_hand_number(tournament_id):
    """The highest hand number this tournament has on record, or 0 for a new one.

    The hand count a table carries is in-memory state, so a tournament picked up
    after a restart would otherwise deal its next hand as hand 1 — leaving two
    hands numbered 1 in the same night and a finish screen, which reads the last
    number rather than counting the rows, reporting a fraction of what was
    played.
    """
    return (
        Hand.objects.filter(tournament_id=tournament_id)
        .aggregate(highest=Max("hand_number"))["highest"]
        or 0
    )


@database_sync_to_async
def _db_get_levels(tournament_id):
    return list(
        BlindLevel.objects.filter(tournament_id=tournament_id)
        .order_by("level_number")
        .values("is_break", "small_blind", "big_blind", "ante", "duration_hands", "duration_minutes")
    )


@database_sync_to_async
def _db_get_player_records(tournament_id):
    records = list(
        TournamentPlayer.objects.filter(tournament_id=tournament_id)
        .select_related("user", "table")
        .order_by("seat")
        .values(
            "id",
            "user_id",
            "user__username",
            "user__profile__display_name",
            "user__profile__avatar_emoji",
            "user__profile__avatar_border",
            "user__profile__theme",
            "table_id",
            "table__table_number",
            "seat",
            "seat_at_table",
            "chips",
            "is_eliminated",
            "finish_position",
            "time_bank_seconds_remaining",
            "rebuy_count",
            "bounty_cents",
            "bounty_won_cents",
            "knockouts",
        )
    )

    # A second, tiny query rather than a join: the avatar bytes live in their
    # own table precisely so that the query behind every hand never touches
    # them, and all this needs is the stamp that makes up the URL.
    stamps = dict(
        AvatarImage.objects.filter(user_id__in={record["user_id"] for record in records})
        .values_list("user_id", "updated_at")
    )
    for record in records:
        record["avatar_url"] = avatar_url(record["user_id"], stamps.get(record["user_id"]))
    return records


@database_sync_to_async
def _db_get_shown_name(user_id):
    """What this player is called in front of the table."""
    row = (
        User.objects.filter(pk=user_id)
        .values_list("username", "profile__display_name")
        .first()
    )
    return shown_name(*row) if row else ""


@database_sync_to_async
def _db_get_user_table_record(tournament_id, user_id):
    return (
        TournamentPlayer.objects.filter(tournament_id=tournament_id, user_id=user_id)
        .select_related("table")
        .values("table_id", "table__table_number", "is_eliminated")
        .first()
    )


@database_sync_to_async
@transaction.atomic
def _db_apply_table_layout(tournament_id, players_per_table, layout, active_table_numbers):
    tournament = Tournament.objects.get(id=tournament_id)
    tournament.tables.exclude(table_number__in=active_table_numbers).update(is_active=False)

    table_map = {}
    for table_number in active_table_numbers:
        table, _ = tournament.tables.get_or_create(
            table_number=table_number,
            defaults={"max_seats": players_per_table, "is_active": True},
        )
        updates = []
        if table.max_seats != players_per_table:
            table.max_seats = players_per_table
            updates.append("max_seats")
        if not table.is_active:
            table.is_active = True
            updates.append("is_active")
        if updates:
            table.save(update_fields=updates)
        table_map[table_number] = table

    # Both (tournament, seat) and (table, seat_at_table) are unique, so applying
    # a layout row by row collides as soon as players shift places. Eliminated
    # players keep their old seat and are NOT in the layout, so compacting the
    # survivors down lands straight on top of them — which crashed the whole
    # coordinator right after the first bust. Park every row of the tournament
    # out of the way first, then assign.
    all_ids = list(
        TournamentPlayer.objects.filter(tournament_id=tournament_id).values_list("id", flat=True)
    )
    for index, tp_id in enumerate(all_ids):
        TournamentPlayer.objects.filter(id=tp_id).update(seat=-(index + 1), seat_at_table=None)

    for assignment in layout:
        TournamentPlayer.objects.filter(id=assignment["tp_id"]).update(
            table=table_map[assignment["table_number"]],
            seat=assignment["seat"],
            seat_at_table=assignment["seat_at_table"],
        )

    # Anyone not in the layout (eliminated) gets a seat above the active range,
    # so they stay unique and don't hold a seat a survivor needs.
    seated = {assignment["tp_id"] for assignment in layout}
    for offset, tp_id in enumerate(tp_id for tp_id in all_ids if tp_id not in seated):
        TournamentPlayer.objects.filter(id=tp_id).update(seat=len(layout) + offset)

    return {
        number: {"id": table.id, "max_seats": table.max_seats}
        for number, table in table_map.items()
    }


@database_sync_to_async
def _db_update_player_states(tournament_id, states):
    for state in states:
        TournamentPlayer.objects.filter(id=state["tp_id"], tournament_id=tournament_id).update(
            chips=state["chips"],
            is_eliminated=state["is_eliminated"],
            # Not gated on is_eliminated: the winner finishes 1st while still
            # alive, and that was being written away as NULL.
            finish_position=state["finish_position"] or None,
            time_bank_seconds_remaining=state["time_bank_seconds_remaining"],
            bounty_cents=state.get("bounty_cents", 0),
            bounty_won_cents=state.get("bounty_won_cents", 0),
            knockouts=state.get("knockouts", 0),
        )


async def _broadcast_tournament(tournament_id: int, event_type: str, payload: dict):
    await _group_send(get_channel_layer(), _tournament_group_name(tournament_id), event_type, payload)


async def _broadcast_table(tournament_id: int, table_number: int, event_type: str, payload: dict):
    await _group_send(get_channel_layer(), _table_group_name(tournament_id, table_number), event_type, payload)


async def _notify_user(tournament_id: int, user_id: int, payload: dict):
    channel = _player_channels.get((tournament_id, user_id))
    if not channel:
        return
    event_type = "table.assignment" if payload.get("type") == "table_assignment" else "game.message"
    data = payload if event_type == "table.assignment" else json.dumps(payload)
    await get_channel_layer().send(channel, {"type": event_type, "data": data})


async def _request_action(
    tournament_id: int,
    table_number: int,
    player,
    context: dict,
    is_paused: Callable[[], bool] | None = None,
):
    user_id = player._user_id
    key = (tournament_id, user_id)
    valid = context.get("valid_actions", [])
    base_timer = context.get("action_timer_seconds", 20)
    bank_remaining = max(0, getattr(player, "time_bank_seconds_remaining", 0))
    total_timeout = base_timer + bank_remaining
    action_payload = {
        **context,
        "timer_sec": total_timeout,
        "action_timer_sec": base_timer,
        "time_bank_seconds_remaining": bank_remaining,
    }
    await _broadcast_table(tournament_id, table_number, "action_required", action_payload)
    _pending_actions[key] = {
        "payload": action_payload,
        "deadline": time.monotonic() + total_timeout,
        "bank": bank_remaining,
    }

    if getattr(player, "is_sitting_out", False):
        # Sitting out still posts blinds and antes; the turn just passes.
        action = "check" if "check" in valid else "fold"
        await _broadcast_table(
            tournament_id, table_number, "action_taken",
            {"seat": player._seat, "action": action, "amount": 0},
        )
        _pending_actions.pop(key, None)
        return action, 0

    queue = _action_queues.get(key)
    if queue:
        while not queue.empty():
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                break

    try:
        elapsed = 0.0        # the whole turn, which the base timer runs on
        bank_spent = 0.0     # only the part of it the bank actually paid for
        action = None
        amount = 0

        while True:
            if is_paused is not None and is_paused():
                await asyncio.sleep(0.25)
                continue

            past_base = elapsed >= base_timer
            # A time bank is time to think, and somebody whose connection has
            # dropped is not thinking with it. It stops being spent while they
            # are away, and is still there when they get back.
            #
            # Their turn still ends when the base timer does, though: freezing
            # the clock outright would let one dropped connection hold up every
            # other player at the table for as long as it stayed dropped.
            connected = _player_channels.get(key) is not None
            if past_base and (not connected or bank_spent >= bank_remaining):
                break

            wait_slice = 0.25
            started_at = time.monotonic()
            try:
                action, amount = await asyncio.wait_for(queue.get(), timeout=wait_slice)
                elapsed += time.monotonic() - started_at
                break
            except asyncio.TimeoutError:
                waited = time.monotonic() - started_at
                elapsed += waited
                if past_base and connected:
                    bank_spent += waited

        if action is None:
            raise asyncio.TimeoutError

        player.time_bank_seconds_remaining = max(0, bank_remaining - math.ceil(bank_spent))
    except asyncio.TimeoutError:
        # Whatever of the bank went unspent stays theirs — see above.
        player.time_bank_seconds_remaining = max(0, bank_remaining - math.ceil(bank_spent))
        action = "check" if "check" in valid else "fold"
        amount = 0
    except Exception:
        action, amount = "fold", 0

    _pending_actions.pop(key, None)

    if action not in valid:
        if "check" in valid:
            return "check", 0
        if "call" in valid:
            return "call", 0
        return "fold", 0
    return action, amount


async def _run_tournament(tournament_id: int, coordinator: MultiTableTournamentCoordinator):
    cancelled = False
    try:
        await coordinator.run()
    except asyncio.CancelledError:
        # Server shutdown or explicit cancellation — leave the tournament's
        # status alone so a paused/running one can still be resumed later.
        cancelled = True
        raise
    except Exception as exc:
        traceback_text = traceback.format_exc()
        print(f"[TOURNAMENT ERROR] {exc}\n{traceback_text}")
        await _broadcast_tournament(tournament_id, "error", {"message": str(exc)})
    finally:
        _game_tasks.pop(tournament_id, None)
        _tournament_runners.pop(tournament_id, None)
        if not cancelled:
            await _db_set_tournament_status(tournament_id, "finished")
            await _db_settle_tournament(tournament_id)


class TournamentConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope.get("user", AnonymousUser())
        if isinstance(self.user, AnonymousUser) or self.user.is_anonymous:
            await self.close()
            return

        # What this player is called in front of everybody else. Read once
        # here rather than on every line of chat they type.
        self.shown_name = await _db_get_shown_name(self.user.id)

        self.tournament_id = int(self.scope["url_route"]["kwargs"]["tournament_id"])
        self.tournament_group = _tournament_group_name(self.tournament_id)
        self.current_table_number = None
        self.is_spectator = False

        player_record = await _db_get_user_table_record(self.tournament_id, self.user.id)
        # Nobody at all, or somebody who is out and has asked for a particular
        # table: either way there is no seat to reconnect to, only the rail.
        if player_record is None or (
            player_record["is_eliminated"] and self._requested_spectator_table() is not None
        ):
            await self._connect_as_spectator()
            return

        self.current_table_number = player_record["table__table_number"]

        key = (self.tournament_id, self.user.id)
        _player_channels[key] = self.channel_name
        _action_queues.setdefault(key, asyncio.Queue())

        await self.channel_layer.group_add(self.tournament_group, self.channel_name)
        if self.current_table_number is not None:
            await self.channel_layer.group_add(_table_group_name(self.tournament_id, self.current_table_number), self.channel_name)
        await self.accept()

        if self.tournament_id in _tournament_runners:
            await self._send_snapshot()
            runtime_player = _tournament_runners[self.tournament_id].get_runtime_player(self.user.id)
            if runtime_player is not None:
                await _tournament_runners[self.tournament_id].mark_player_reconnected(self.user.id)
                await _broadcast_table(
                    self.tournament_id,
                    runtime_player._table_number,
                    "player_reconnected",
                    {"seat": runtime_player._seat, "name": runtime_player.name},
                )
        else:
            await self._maybe_boot_game()
            await self._send_snapshot()

        await self._resend_pending_action()

    def _requested_spectator_table(self) -> Optional[int]:
        """The table this socket asked to watch, if it asked at all."""
        query = parse_qs(self.scope.get("query_string", b"").decode())
        if query.get("spectate", ["0"])[0] != "1":
            return None
        try:
            return int(query.get("table", ["1"])[0])
        except (TypeError, ValueError):
            return 1

    async def _connect_as_spectator(self):
        """Seat someone behind the rail: they read the table and never write.

        No entry in `_player_channels`, so the unicast that carries hole cards
        has nowhere to reach them even if something tried.
        """
        table_number = self._requested_spectator_table()
        if table_number is None:
            await self.close()
            return
        tournament = await _db_get_tournament(self.tournament_id)
        if tournament is None or tournament.status not in ("running", "paused"):
            await self.close()
            return

        self.is_spectator = True
        self.current_table_number = table_number
        await self.channel_layer.group_add(self.tournament_group, self.channel_name)
        await self.channel_layer.group_add(
            _table_group_name(self.tournament_id, table_number),
            self.channel_name,
        )
        await self.accept()
        # The engine decides which table this really is — an unknown number
        # falls back to a live one, and the groups have to follow that.
        await self._send_snapshot()
        if self.current_table_number != table_number:
            await self.channel_layer.group_discard(
                _table_group_name(self.tournament_id, table_number),
                self.channel_name,
            )
            await self.channel_layer.group_add(
                _table_group_name(self.tournament_id, self.current_table_number),
                self.channel_name,
            )

    async def _resend_pending_action(self):
        """Hand a reconnecting player back the decision they still owe.

        Without this the client has no action context, shows "waiting for next
        hand" and times out into a fold even though the server is still
        listening on their action queue.
        """
        pending = _pending_actions.get((self.tournament_id, self.user.id))
        if pending is None:
            return
        remaining = int(pending["deadline"] - time.monotonic())
        if remaining <= 0:
            return
        bank = pending["bank"]
        await self.send(text_data=json.dumps({
            **pending["payload"],
            "type": "action_required",
            "timer_sec": remaining,
            # Once the regular clock is gone the rest of the countdown is bank.
            "action_timer_sec": max(0, remaining - bank),
        }))

    async def disconnect(self, code):
        if getattr(self, "is_spectator", False):
            await self.channel_layer.group_discard(self.tournament_group, self.channel_name)
            if self.current_table_number is not None:
                await self.channel_layer.group_discard(
                    _table_group_name(self.tournament_id, self.current_table_number),
                    self.channel_name,
                )
            return

        key = (self.tournament_id, self.user.id)
        # A reconnect (or React StrictMode's double mount) can register the new
        # socket before this one tears down. If we have already been superseded,
        # touching the shared state would unregister the LIVE channel — which
        # silently drops unicast hole cards — and announce a disconnect the
        # player never had.
        superseded = _player_channels.get(key) != self.channel_name

        await self.channel_layer.group_discard(self.tournament_group, self.channel_name)
        if self.current_table_number is not None:
            await self.channel_layer.group_discard(
                _table_group_name(self.tournament_id, self.current_table_number),
                self.channel_name,
            )

        if superseded:
            return

        _player_channels.pop(key, None)
        # Whether this player has actually left, or has simply gone to look at
        # something else in the app. See away.py: a lobby and several tables at
        # once both used to read as a disconnection.
        gone = _truly_gone(
            app_open=_app_is_open(self.user.id),
            other_tables=any(user_id == self.user.id for _tid, user_id in _player_channels),
        )
        # Only once we know this socket was not superseded — otherwise a
        # reconnect would tear down the presence the live socket just announced.
        await self._forget_media_presence(self.current_table_number)
        coordinator = _tournament_runners.get(self.tournament_id)
        if coordinator is not None:
            runtime_player = coordinator.get_runtime_player(self.user.id)
            if runtime_player is not None:
                # The engine is told either way: somebody in the lobby cannot
                # act on a hand any more than somebody who left can, and the
                # seat still has to be sat out eventually. What changes is only
                # what the table is told to *show*.
                await coordinator.mark_player_disconnected(self.user.id)
                if gone:
                    await _broadcast_table(
                        self.tournament_id,
                        runtime_player._table_number,
                        "player_disconnected",
                        {"seat": runtime_player._seat, "name": runtime_player.name},
                    )

    async def receive(self, text_data):
        # A spectator has no seat, no action queue and no voice at the table.
        if self.is_spectator:
            return
        try:
            data = json.loads(text_data)
        except ValueError:
            return
        message_type = data.get("type")

        if message_type == "player_action":
            queue = _action_queues.get((self.tournament_id, self.user.id))
            if queue:
                await queue.put((data.get("action", "fold"), data.get("amount", 0)))
        elif message_type == "sit_out":
            # A player can only ever change their own sit-out state.
            coordinator = _tournament_runners.get(self.tournament_id)
            if coordinator is not None:
                await coordinator.set_sitting_out(self.user.id, bool(data.get("value")))
        elif message_type == "show_cards":
            coordinator = _tournament_runners.get(self.tournament_id)
            if coordinator is not None:
                raw = data.get("cards")
                indices = raw if isinstance(raw, list) else [0, 1]
                await coordinator.show_cards(
                    self.user.id,
                    [index for index in indices if isinstance(index, int)],
                )
        elif message_type == "ready":
            # Like sit_out: a player only ever speaks for their own seat.
            coordinator = _tournament_runners.get(self.tournament_id)
            if coordinator is not None:
                await coordinator.set_ready(self.user.id, bool(data.get("value", True)))
        elif message_type == "side_bet":
            # Backing somebody to win a hand you folded. Everything that makes
            # this legal — that you are out of the hand, that they are in it,
            # that the cards are not face up yet — is the coordinator's to
            # judge, since it is the only thing that knows.
            coordinator = _tournament_runners.get(self.tournament_id)
            if coordinator is not None:
                try:
                    on_user_id = int(data.get("on_user_id"))
                except (TypeError, ValueError):
                    return
                await coordinator.place_side_bet(self.user.id, on_user_id, data.get("stake"))
        elif message_type == "chat_message":
            await self._send_chat(data)
        elif message_type == "throw_item":
            await self._throw_item(data)
        elif message_type in ("media_signal", "media_presence"):
            if not self._media_budget_allows():
                return
            if message_type == "media_signal":
                await self._relay_media_signal(data)
            else:
                await self._announce_media_presence(data)

    async def _throw_item(self, data):
        """Throw something at somebody at your table.

        The item is one of a closed list (see throwables.py) and the target has
        to be a player sitting at the same table as you — otherwise this is a
        way to make an object appear on the screen of anybody whose id you can
        guess, at a table you are not even at.
        """
        item = _clean_item(data.get("item"))
        if item is None:
            return

        # Checked on the throw, not only in the shop: a price enforced at the
        # till is a suggestion. The free ones need no lookup at all, which is
        # most throws and all of the old ones.
        if not _is_free_item(item) and not await _db_owns_throwable(self.user.id, item):
            return

        try:
            target_id = int(data.get("at_user_id"))
        except (TypeError, ValueError):
            return
        if target_id == self.user.id:
            return   # nothing to animate, and nothing anybody wants to watch

        # Three in a row and the arm is tired for ten seconds. Deliberately a
        # burst rather than a wait on every throw: answering a tomato with a
        # tomato is the point of the feature. See throwlimit.py.
        allowed, kept, cooling_for = _throw_check(
            getattr(self, "_throw_times", []), time.monotonic(),
        )
        self._throw_times = kept
        if not allowed:
            # Told rather than silently dropped: a button that does nothing
            # reads as a broken button, and the player then presses it more.
            await self.send(text_data=json.dumps({
                "type": "throw_cooldown",
                "seconds": cooling_for,
            }))
            return

        runner = _tournament_runners.get(self.tournament_id)
        if runner is None:
            return
        thrower = runner.get_runtime_player(self.user.id)
        target = runner.get_runtime_player(target_id)
        if thrower is None or target is None:
            return
        # Same table, or it is being thrown through a wall.
        if thrower._table_number != target._table_number:
            return

        await _broadcast_table(self.tournament_id, thrower._table_number, "item_thrown", {
            "item": item,
            "from_user_id": self.user.id,
            "from_name": self.shown_name,
            "from_seat": thrower._seat,
            "to_user_id": target_id,
            "to_name": target.name,
            "to_seat": target._seat,
        })

    async def _send_chat(self, data):
        """Say something to the rest of your table.

        Not stored: the table talk belongs to the session it happened in, and
        keeping a transcript of a friendly game is a promise nobody asked for.
        """
        text = str(data.get("text") or "").strip()[:CHAT_MAX_CHARS]
        # A GIF travels as its Giphy id and never as a URL. Taking a URL here
        # would make table chat a way to put any image on somebody else's
        # screen, from any host, with the table's own styling around it.
        gif_id = _clean_gif_id(data.get("gif_id"))
        if not text and not gif_id:
            return

        # A flood would push the game's own messages down the same socket.
        now = time.monotonic()
        window_start, count = getattr(self, "_chat_window", (0.0, 0))
        if now - window_start > CHAT_WINDOW_SECONDS:
            window_start, count = now, 0
        self._chat_window = (window_start, count + 1)
        if count + 1 > CHAT_MESSAGE_BUDGET:
            return

        table = await self._media_table_of(self.user.id)
        if table is None:
            return

        await _broadcast_table(self.tournament_id, table, "chat_message", {
            "user_id": self.user.id,
            "name": self.shown_name,
            "text": text,
            "gif_id": gif_id,
        })

    # ------------------------------------------------------------------
    # Camera and microphone.
    #
    # The server never touches the media itself: peers connect directly to each
    # other, and this is only the postbox they use to find one another. It stays
    # deliberately ignorant of what a signal contains.
    # ------------------------------------------------------------------

    def _media_budget_allows(self) -> bool:
        """Keep a flood of signalling from delaying somebody's fold.

        This socket carries game actions too, so media traffic gets a budget.
        Without a TURN server the ICE exchange is short — a couple of dozen
        messages per peer — so this only ever catches abuse.
        """
        now = time.monotonic()
        window_start, count = getattr(self, "_media_window", (0.0, 0))
        if now - window_start > MEDIA_WINDOW_SECONDS:
            window_start, count = now, 0
        count += 1
        self._media_window = (window_start, count)
        return count <= MEDIA_MESSAGE_BUDGET

    async def _media_table_of(self, user_id: int):
        """Which table a player is at, according to the server.

        Derived from the live engine, never from anything the client sent, since
        this is what decides who is allowed to call whom.
        """
        coordinator = _tournament_runners.get(self.tournament_id)
        if coordinator is not None:
            runtime_player = coordinator.get_runtime_player(user_id)
            if runtime_player is not None:
                return runtime_player._table_number

        record = await _db_get_user_table_record(self.tournament_id, user_id)
        return record["table__table_number"] if record else None

    async def _relay_media_signal(self, data):
        """Pass one peer's offer, answer or ICE candidate to another.

        The signal is opaque here. Forwarding it blindly is the point: the two
        browsers negotiate, and the server only has to make sure they are
        actually sitting at the same table.
        """
        try:
            target_id = int(data.get("to_user_id"))
        except (TypeError, ValueError):
            return
        if target_id == self.user.id:
            return

        signal = data.get("signal")
        if not isinstance(signal, dict) or len(json.dumps(signal)) > MEDIA_SIGNAL_MAX_BYTES:
            return

        my_table = await self._media_table_of(self.user.id)
        if my_table is None or my_table != await self._media_table_of(target_id):
            return

        await _notify_user(self.tournament_id, target_id, {
            "type": "media_signal",
            "from_user_id": self.user.id,
            "signal": signal,
        })

    async def _announce_media_presence(self, data):
        """Say that this player turned a camera or microphone on, or off."""
        audio, video = bool(data.get("audio")), bool(data.get("video"))
        table = await self._media_table_of(self.user.id)
        if table is None:
            return

        key = (self.tournament_id, self.user.id)
        if not audio and not video:
            _media_presence.pop(key, None)
            await _broadcast_table(self.tournament_id, table, "media_left", {"user_id": self.user.id})
            return

        _media_presence[key] = {"audio": audio, "video": video, "table": table}
        await _broadcast_table(self.tournament_id, table, "media_presence", {
            "user_id": self.user.id,
            "name": self.shown_name,
            "audio": audio,
            "video": video,
        })
        # The roster is the reply to the announcement, so arriving takes one
        # round trip rather than an announce-then-ask pair.
        await self.send(text_data=json.dumps({
            "type": "media_roster",
            "table_number": table,
            "peers": _media_peers_at(self.tournament_id, table, exclude_user_id=self.user.id),
        }))

    async def _forget_media_presence(self, table_number):
        """Drop this player's media presence and tell their table."""
        if _media_presence.pop((self.tournament_id, self.user.id), None) is None:
            return
        if table_number is not None:
            await _broadcast_table(self.tournament_id, table_number, "media_left", {"user_id": self.user.id})

    async def _maybe_boot_game(self):
        if self.tournament_id in _game_tasks:
            return

        # Claim the slot before the first await. Clients connect together (a
        # table full of players, and StrictMode mounting twice), and every await
        # below is a chance for another connect to pass the check above and boot
        # a SECOND engine for the same tournament. Two coordinators then run the
        # same players from separate in-memory copies and persist over each
        # other, which showed up as chips reverting and players flickering in
        # and out of being eliminated.
        _game_tasks[self.tournament_id] = None
        try:
            await self._boot_game()
        except Exception:
            _game_tasks.pop(self.tournament_id, None)
            raise

    async def _boot_game(self):
        def release():
            if _game_tasks.get(self.tournament_id) is None:
                _game_tasks.pop(self.tournament_id, None)

        tournament = await _db_get_tournament(self.tournament_id)
        if tournament is None or tournament.status not in ("running", "paused"):
            release()
            return

        player_records = await _db_get_player_records(self.tournament_id)
        if len(player_records) < 2:
            release()
            return

        levels = await _db_get_levels(self.tournament_id)
        last_hand_number = await _db_get_last_hand_number(self.tournament_id)
        fast = fast_payload(tournament)
        coordinator = MultiTableTournamentCoordinator(
            tournament_id=self.tournament_id,
            players_per_table=tournament.players_per_table,
            levels=levels,
            time_bank_seconds=tournament.time_bank_seconds,
            time_bank_refill_rule=tournament.time_bank_refill_rule,
            time_bank_refill_every_hands=tournament.time_bank_refill_every_hands,
            time_bank_refill_level=tournament.time_bank_refill_level,
            rabbit_hunting_enabled=tournament.rabbit_hunting_enabled,
            auto_remove_offline_seconds=tournament.auto_remove_offline_seconds,
            # Not a per-tournament setting: it is a rule about how long a table
            # waits for somebody, and it comes out of whether the night is
            # played for money.
            offline_sit_out_seconds=offline_sit_out_seconds(tournament),
            bounty=BountyConfig.from_tournament(tournament),
            showdown_seconds=tournament.showdown_seconds,
            allow_rebuys=tournament.allow_rebuys,
            max_rebuys=tournament.max_rebuys,
            rebuy_level=tournament.rebuy_level,
            late_reg_level=tournament.late_reg_level,
            # Mystery bounties: how many places pay, when the envelopes open,
            # and the pool as the row has it — which after a restart is a pool
            # already opened and partly drawn.
            paid_places=len(tournament.payout_structure or []),
            mystery_release=tournament.mystery_release,
            mystery_envelopes=list(tournament.mystery_envelopes or []),
            mystery_cut=list(tournament.mystery_cut or []),
            mystery_opened=tournament.mystery_opened_at is not None,
            mystery_winner_keeps=tournament.mystery_winner_keeps,
            all_in_or_fold=tournament.format == "allinfold",
            open_mystery=lambda draws: _db_open_mystery(self.tournament_id, draws),
            persist_mystery=lambda envelopes: _db_persist_mystery(self.tournament_id, envelopes),
            broadcast_tournament=lambda event_type, payload: _broadcast_tournament(self.tournament_id, event_type, payload),
            broadcast_table=lambda table_number, event_type, payload: _broadcast_table(
                self.tournament_id,
                table_number,
                event_type,
                payload,
            ),
            request_action=lambda table_number, player, context: _request_action(
                self.tournament_id,
                table_number,
                player,
                context,
                is_paused=lambda: coordinator.is_paused,
            ),
            notify_user=lambda user_id, payload: _notify_user(self.tournament_id, user_id, payload),
            load_players=lambda: self._load_player_records(),
            persist_assignments=lambda layout, active_table_numbers: self._persist_assignments(
                tournament.players_per_table,
                layout,
                active_table_numbers,
            ),
            persist_player_states=lambda players: self._persist_player_states(players),
            persist_progress=lambda level_index, hands: _db_set_progress(self.tournament_id, level_index, hands),
            persist_hand=lambda payload: _db_save_hand(self.tournament_id, payload),
            take_side_bet_stake=_db_take_side_bet_stake,
            pay_side_bets=_db_pay_side_bets,
            level_index=tournament.current_level_index,
            hands_in_level=tournament.hands_in_level,
            last_hand_number=last_hand_number,
            # What kind of game this is and what it pays, carried to the table so
            # it can lay the right felt, reveal a draw, and tell anybody who
            # reconnects mid-game what they are playing for.
            fast=fast,
            # Half a minute of loading time is for a tournament people arrived
            # for. A fast game fires the moment its last seat fills, and everyone
            # in it is already looking at it.
            countdown_seconds=8 if fast else 30,
        )
        # Booting a paused tournament must not start dealing; run() waits for
        # the host to resume before it announces the start.
        coordinator.is_paused = tournament.status == "paused"
        _tournament_runners[self.tournament_id] = coordinator
        _game_tasks[self.tournament_id] = asyncio.create_task(_run_tournament(self.tournament_id, coordinator))

    async def _send_snapshot(self):
        coordinator = _tournament_runners.get(self.tournament_id)
        if coordinator is None:
            return
        snapshot = (
            await coordinator.snapshot_for_table(self.current_table_number)
            if self.is_spectator
            else await coordinator.snapshot_for_user(self.user.id)
        )
        if snapshot is None:
            return
        self.current_table_number = snapshot.get("current_table_number")
        await self.send(text_data=json.dumps(snapshot))

    async def game_message(self, event):
        await self.send(text_data=event["data"])

    async def table_assignment(self, event):
        data = event["data"]
        next_table_number = data.get("table_number")
        # The old table loses this player entirely, media included. They
        # re-announce once they land, so their new neighbours call them instead.
        await self._forget_media_presence(self.current_table_number)
        if self.current_table_number is not None:
            await self.channel_layer.group_discard(
                _table_group_name(self.tournament_id, self.current_table_number),
                self.channel_name,
            )
        self.current_table_number = next_table_number
        if next_table_number is not None:
            await self.channel_layer.group_add(
                _table_group_name(self.tournament_id, next_table_number),
                self.channel_name,
            )

        await self.send(text_data=json.dumps(data))
        await self._send_snapshot()

    async def _load_player_records(self):
        records = await _db_get_player_records(self.tournament_id)
        return [
            {
                "id": record["id"],
                "user_id": record["user_id"],
                "username": record["user__username"],
                # What the table calls them. The username above is still the
                # identity every key and every stat is filed under.
                "display_name": shown_name(
                    record["user__username"], record["user__profile__display_name"],
                ),
                "avatar": record["user__profile__avatar_emoji"] or "\U0001F0CF",
                # The ring they bought, drawn around that face at the table.
                "avatar_border": record["user__profile__avatar_border"] or "",
                # None unless they uploaded a picture, in which case it is what
                # the table draws and the emoji is only the fallback.
                "avatar_url": record["avatar_url"],
                # Their chosen knockout GIF, validated when it was saved and
                # re-checked here: a profile written before the rule existed,
                # or by hand, must not reach the table unchecked.
                "finisher_gif_id": _clean_gif_id((record["user__profile__theme"] or {}).get("finisher_gif_id")),
                # Everything they have chosen, cleaned the same way and in the
                # same breath — the table picks one of these per knockout, so
                # the same clip does not play every time somebody busts.
                "finishers": finisher_list(record["user__profile__theme"]),
                "table_id": record["table_id"],
                "table_number": record["table__table_number"],
                "seat": record["seat"],
                "seat_at_table": record["seat_at_table"],
                "chips": record["chips"],
                "is_eliminated": record["is_eliminated"],
                "finish_position": record["finish_position"],
                "time_bank_seconds_remaining": record["time_bank_seconds_remaining"],
                "rebuy_count": record["rebuy_count"],
                "bounty_cents": record["bounty_cents"],
                "bounty_won_cents": record["bounty_won_cents"],
                "knockouts": record["knockouts"],
            }
            for record in records
        ]

    async def _persist_assignments(self, players_per_table, layout, active_table_numbers):
        return await _db_apply_table_layout(self.tournament_id, players_per_table, layout, active_table_numbers)

    async def _persist_player_states(self, players):
        states = [
            {
                "tp_id": player._tp_id,
                "chips": player.chips,
                "is_eliminated": player.is_eliminated,
                "finish_position": player.finish_position,
                "time_bank_seconds_remaining": player.time_bank_seconds_remaining,
                "bounty_cents": getattr(player, "_bounty_cents", 0),
                "bounty_won_cents": getattr(player, "_bounty_won_cents", 0),
                "knockouts": getattr(player, "_knockouts", 0),
            }
            for player in players
        ]
        await _db_update_player_states(self.tournament_id, states)
