"""WebSocket consumer for live tournament play."""

from __future__ import annotations

import asyncio
import json
import math
import time
import traceback
from typing import Callable, Dict, Tuple

from channels.db import database_sync_to_async
from django.db import transaction
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.layers import get_channel_layer
from django.contrib.auth.models import AnonymousUser

from tournaments.models import BlindLevel, Tournament, TournamentPlayer

from .models import Hand, HandAction

from .coordinator import MultiTableTournamentCoordinator


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
    Tournament.objects.filter(id=tournament_id).update(status=status)


@database_sync_to_async
def _db_settle_tournament(tournament_id):
    """Work out who owes whom, now that the results are final."""
    from tournaments.ledger import settle_finished

    return settle_finished(tournament_id)


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
def _db_get_levels(tournament_id):
    return list(
        BlindLevel.objects.filter(tournament_id=tournament_id)
        .order_by("level_number")
        .values("is_break", "small_blind", "big_blind", "ante", "duration_hands", "duration_minutes")
    )


@database_sync_to_async
def _db_get_player_records(tournament_id):
    return list(
        TournamentPlayer.objects.filter(tournament_id=tournament_id)
        .select_related("user", "table")
        .order_by("seat")
        .values(
            "id",
            "user_id",
            "user__username",
            "user__profile__avatar_emoji",
            "table_id",
            "table__table_number",
            "seat",
            "seat_at_table",
            "chips",
            "is_eliminated",
            "finish_position",
            "time_bank_seconds_remaining",
        )
    )


@database_sync_to_async
def _db_get_user_table_record(tournament_id, user_id):
    return (
        TournamentPlayer.objects.filter(tournament_id=tournament_id, user_id=user_id)
        .select_related("table")
        .values("table_id", "table__table_number")
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
        elapsed = 0.0
        action = None
        amount = 0

        while elapsed < total_timeout:
            if is_paused is not None and is_paused():
                await asyncio.sleep(0.25)
                continue

            wait_slice = min(0.25, total_timeout - elapsed)
            started_at = time.monotonic()
            try:
                action, amount = await asyncio.wait_for(queue.get(), timeout=wait_slice)
                elapsed += time.monotonic() - started_at
                break
            except asyncio.TimeoutError:
                elapsed += time.monotonic() - started_at

        if action is None:
            raise asyncio.TimeoutError

        bank_used = min(bank_remaining, max(0, math.ceil(elapsed - base_timer)))
        player.time_bank_seconds_remaining = bank_remaining - bank_used
    except asyncio.TimeoutError:
        player.time_bank_seconds_remaining = 0
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

        self.tournament_id = int(self.scope["url_route"]["kwargs"]["tournament_id"])
        self.tournament_group = _tournament_group_name(self.tournament_id)
        self.current_table_number = None

        player_record = await _db_get_user_table_record(self.tournament_id, self.user.id)
        if player_record is None:
            await self.close()
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
        # Only once we know this socket was not superseded — otherwise a
        # reconnect would tear down the presence the live socket just announced.
        await self._forget_media_presence(self.current_table_number)
        coordinator = _tournament_runners.get(self.tournament_id)
        if coordinator is not None:
            runtime_player = coordinator.get_runtime_player(self.user.id)
            if runtime_player is not None:
                await coordinator.mark_player_disconnected(self.user.id)
                await _broadcast_table(
                    self.tournament_id,
                    runtime_player._table_number,
                    "player_disconnected",
                    {"seat": runtime_player._seat, "name": runtime_player.name},
                )

    async def receive(self, text_data):
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
        elif message_type in ("media_signal", "media_presence"):
            if not self._media_budget_allows():
                return
            if message_type == "media_signal":
                await self._relay_media_signal(data)
            else:
                await self._announce_media_presence(data)

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
            "name": self.user.username,
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
            level_index=tournament.current_level_index,
            hands_in_level=tournament.hands_in_level,
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
        snapshot = await coordinator.snapshot_for_user(self.user.id)
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
                "avatar": record["user__profile__avatar_emoji"] or "\U0001F0CF",
                "table_id": record["table_id"],
                "table_number": record["table__table_number"],
                "seat": record["seat"],
                "seat_at_table": record["seat_at_table"],
                "chips": record["chips"],
                "is_eliminated": record["is_eliminated"],
                "finish_position": record["finish_position"],
                "time_bank_seconds_remaining": record["time_bank_seconds_remaining"],
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
            }
            for player in players
        ]
        await _db_update_player_states(self.tournament_id, states)
