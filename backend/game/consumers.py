"""WebSocket consumer for live tournament play."""

from __future__ import annotations

import asyncio
import json
import traceback
from typing import Dict, Tuple

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.layers import get_channel_layer
from django.contrib.auth.models import AnonymousUser

from tournaments.models import BlindLevel, Tournament, TournamentPlayer

from .coordinator import MultiTableTournamentCoordinator


_game_tasks: Dict[int, asyncio.Task] = {}
_action_queues: Dict[Tuple[int, int], asyncio.Queue] = {}
_player_channels: Dict[Tuple[int, int], str] = {}
_tournament_runners: Dict[int, MultiTableTournamentCoordinator] = {}


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
def _db_get_tournament(tournament_id):
    try:
        return Tournament.objects.get(id=tournament_id)
    except Tournament.DoesNotExist:
        return None


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
            "table_id",
            "table__table_number",
            "seat",
            "seat_at_table",
            "chips",
            "is_eliminated",
            "finish_position",
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

    for assignment in layout:
        TournamentPlayer.objects.filter(id=assignment["tp_id"]).update(
            table=table_map[assignment["table_number"]],
            seat=assignment["seat"],
            seat_at_table=assignment["seat_at_table"],
        )

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
            finish_position=state["finish_position"] if state["is_eliminated"] else None,
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


async def _request_action(tournament_id: int, table_number: int, player, context: dict):
    user_id = player._user_id
    key = (tournament_id, user_id)
    valid = context.get("valid_actions", [])
    await _broadcast_table(tournament_id, table_number, "action_required", {**context, "timer_sec": 20})

    queue = _action_queues.get(key)
    if queue:
        while not queue.empty():
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                break

    try:
        action, amount = await asyncio.wait_for(queue.get(), timeout=20)
    except asyncio.TimeoutError:
        action = "check" if "check" in valid else "fold"
        amount = 0
    except Exception:
        action, amount = "fold", 0

    if action not in valid:
        if "check" in valid:
            return "check", 0
        if "call" in valid:
            return "call", 0
        return "fold", 0
    return action, amount


async def _run_tournament(tournament_id: int, coordinator: MultiTableTournamentCoordinator):
    try:
        await coordinator.run()
    except Exception as exc:
        traceback_text = traceback.format_exc()
        print(f"[TOURNAMENT ERROR] {exc}\n{traceback_text}")
        await _broadcast_tournament(tournament_id, "error", {"message": str(exc)})
    finally:
        _game_tasks.pop(tournament_id, None)
        _tournament_runners.pop(tournament_id, None)
        await _db_set_tournament_status(tournament_id, "finished")


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
                await _broadcast_table(
                    self.tournament_id,
                    runtime_player._table_number,
                    "player_reconnected",
                    {"seat": runtime_player._seat, "name": runtime_player.name},
                )
        else:
            await self._maybe_boot_game()
            await self._send_snapshot()

    async def disconnect(self, code):
        _player_channels.pop((self.tournament_id, self.user.id), None)
        await self.channel_layer.group_discard(self.tournament_group, self.channel_name)
        if self.current_table_number is not None:
            await self.channel_layer.group_discard(
                _table_group_name(self.tournament_id, self.current_table_number),
                self.channel_name,
            )

        coordinator = _tournament_runners.get(self.tournament_id)
        if coordinator is not None:
            runtime_player = coordinator.get_runtime_player(self.user.id)
            if runtime_player is not None:
                await _broadcast_table(
                    self.tournament_id,
                    runtime_player._table_number,
                    "player_disconnected",
                    {"seat": runtime_player._seat, "name": runtime_player.name},
                )

    async def receive(self, text_data):
        data = json.loads(text_data)
        if data.get("type") == "player_action":
            queue = _action_queues.get((self.tournament_id, self.user.id))
            if queue:
                await queue.put((data.get("action", "fold"), data.get("amount", 0)))

    async def _maybe_boot_game(self):
        if self.tournament_id in _game_tasks:
            return

        tournament = await _db_get_tournament(self.tournament_id)
        if tournament is None or tournament.status != "running":
            return

        player_records = await _db_get_player_records(self.tournament_id)
        if len(player_records) < 2:
            return

        levels = await _db_get_levels(self.tournament_id)
        coordinator = MultiTableTournamentCoordinator(
            tournament_id=self.tournament_id,
            players_per_table=tournament.players_per_table,
            levels=levels,
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
            ),
            notify_user=lambda user_id, payload: _notify_user(self.tournament_id, user_id, payload),
            load_players=lambda: self._load_player_records(),
            persist_assignments=lambda layout, active_table_numbers: self._persist_assignments(
                tournament.players_per_table,
                layout,
                active_table_numbers,
            ),
            persist_player_states=lambda players: self._persist_player_states(players),
        )
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
                "table_id": record["table_id"],
                "table_number": record["table__table_number"],
                "seat": record["seat"],
                "seat_at_table": record["seat_at_table"],
                "chips": record["chips"],
                "is_eliminated": record["is_eliminated"],
                "finish_position": record["finish_position"],
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
            }
            for player in players
        ]
        await _db_update_player_states(self.tournament_id, states)
