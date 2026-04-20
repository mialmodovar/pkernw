"""WebSocket consumer for a live tournament game."""

from __future__ import annotations
import asyncio
import json
import traceback
from typing import Dict, Tuple

from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from django.contrib.auth.models import AnonymousUser

from tournaments.models import Tournament, TournamentPlayer, BlindLevel
from .engine.player import Player as EnginePlayer
from .engine.hand import cards_to_list
from .engine.tournament_runner import TournamentRunner


# ── Shared state (per-process) ───────────────────────────────────────────

_game_tasks:      Dict[int, asyncio.Task]              = {}
_action_queues:   Dict[Tuple[int, int], asyncio.Queue] = {}
_player_channels: Dict[Tuple[int, int], str]           = {}
_engine_players:  Dict[int, list]                      = {}
_tournament_runners: Dict[int, TournamentRunner]       = {}
_game_state:      Dict[int, dict]                      = {}  # live hand state for reconnect snapshots


# ── Free functions used by the server-driven tournament task ─────────────

async def _group_send(channel_layer, group, event_type, payload):
    if isinstance(payload, dict):
        msg = {"type": event_type, **payload}
    else:
        msg = {"type": event_type, "data": payload}
    await channel_layer.group_send(group, {
        "type": "game.message",
        "data": json.dumps(msg),
    })


@database_sync_to_async
def _db_set_tournament_status(tid, status):
    Tournament.objects.filter(id=tid).update(status=status)


@database_sync_to_async
def _db_update_player_chips(tp_id, chips, is_eliminated, finish_position):
    TournamentPlayer.objects.filter(id=tp_id).update(
        chips=chips,
        is_eliminated=is_eliminated,
        finish_position=finish_position if is_eliminated else None,
    )


def _make_broadcast(tid: int, group: str):
    """Build a broadcast callback that uses only shared state, no consumer."""
    channel_layer = get_channel_layer()
    _game_state.setdefault(tid, {"community_cards": [], "pot": 0, "street": None, "hand_number": 0})

    async def broadcast(event_type: str, payload: dict):
        # Track live state for reconnect snapshots
        gs = _game_state.get(tid)
        if gs is not None:
            if event_type == "hand_started":
                gs["community_cards"] = []
                gs["pot"] = 0
                gs["street"] = "preflop"
                gs["hand_number"] = payload.get("hand_number", gs["hand_number"])
            elif event_type == "street_dealt":
                gs["community_cards"] = payload.get("cards", [])
                gs["pot"] = payload.get("pot", gs["pot"])
                gs["street"] = payload.get("street", gs["street"])

        # Private hole cards — unicast to each player individually
        if event_type == "hole_cards_dealt":
            for pdata in payload.get("players", []):
                user_id = pdata.get("user_id")
                if user_id is None:
                    continue
                ch_key  = (tid, user_id)
                channel = _player_channels.get(ch_key)
                if channel:
                    try:
                        await channel_layer.send(channel, {
                            "type": "game.message",
                            "data": json.dumps({
                                "type": "hole_cards",
                                "cards": pdata["cards"],
                            }),
                        })
                    except Exception:
                        pass  # player disconnected mid-send
            return

        # Everything else: broadcast to group
        await _group_send(channel_layer, group, event_type, payload)

    return broadcast


def _make_request_action(tid: int, group: str):
    """Build a request_action callback that uses only shared state."""
    channel_layer = get_channel_layer()

    async def request_action(player: EnginePlayer, context: dict):
        user_id = player._user_id
        key     = (tid, user_id)
        valid   = context.get("valid_actions", [])

        # Tell everyone whose turn it is
        await _group_send(channel_layer, group, "action_required", {**context, "timer_sec": 20})

        # Drain stale messages
        queue = _action_queues.get(key)
        if queue:
            while not queue.empty():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    break

        # Wait for player response (connected or not — always wait the full timeout)
        try:
            action, amount = await asyncio.wait_for(queue.get(), timeout=20)
        except asyncio.TimeoutError:
            action = "check" if "check" in valid else "fold"
            amount = 0
        except Exception:
            action, amount = "fold", 0

        # Validate
        if action not in valid:
            if "check" in valid:
                action, amount = "check", 0
            elif "call" in valid:
                action, amount = "call", 0
            else:
                action, amount = "fold", 0

        return action, amount

    return request_action


def _make_on_hand_complete(tid: int):
    """Build a hand-complete callback that persists results to DB."""
    async def on_hand_complete(runner):
        players = _engine_players.get(tid, [])
        for ep in players:
            await _db_update_player_chips(
                ep._tp_id, ep.chips, ep.is_eliminated, ep.finish_position
            )
    return on_hand_complete


async def _run_tournament(tid: int, group: str, runner: TournamentRunner):
    """Top-level server-driven tournament loop. Not tied to any consumer."""
    channel_layer = get_channel_layer()
    try:
        await runner.run()
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[TOURNAMENT ERROR] {e}\n{tb}")
        try:
            await channel_layer.group_send(group, {
                "type": "game.message",
                "data": json.dumps({"type": "error", "message": str(e)}),
            })
        except Exception:
            pass
    finally:
        _game_tasks.pop(tid, None)
        _engine_players.pop(tid, None)
        _tournament_runners.pop(tid, None)
        _game_state.pop(tid, None)
        await _db_set_tournament_status(tid, "finished")


# ── Consumer — thin WebSocket gateway ────────────────────────────────────

class TournamentConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        self.user = self.scope.get("user", AnonymousUser())
        if isinstance(self.user, AnonymousUser) or self.user.is_anonymous:
            await self.close()
            return

        self.tournament_id = int(self.scope["url_route"]["kwargs"]["tournament_id"])
        self.group_name    = f"tournament_{self.tournament_id}"

        key = (self.tournament_id, self.user.id)
        _player_channels[key] = self.channel_name
        _action_queues.setdefault(key, asyncio.Queue())

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # If the game task is already running, send a snapshot
        if self.tournament_id in _engine_players:
            await self._send_snapshot()
            # Notify others this player reconnected
            ep = self._find_engine_player()
            if ep:
                await _group_send(
                    get_channel_layer(), self.group_name,
                    "player_reconnected",
                    {"seat": ep._seat, "name": ep.name},
                )
        else:
            # If the REST API set status to "running" but no task yet, boot it
            await self._maybe_boot_game()

    async def disconnect(self, code):
        key = (self.tournament_id, self.user.id)
        _player_channels.pop(key, None)
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

        # Notify others this player disconnected
        if self.tournament_id in _engine_players:
            ep = self._find_engine_player()
            if ep:
                channel_layer = get_channel_layer()
                await _group_send(
                    channel_layer, self.group_name,
                    "player_disconnected",
                    {"seat": ep._seat, "name": ep.name},
                )

    # ── incoming messages ──────────────────────────────────────────────

    async def receive(self, text_data):
        data = json.loads(text_data)
        msg_type = data.get("type", "")

        if msg_type == "player_action":
            await self._handle_action(data)

    # ── boot game task if DB says "running" ────────────────────────────

    async def _maybe_boot_game(self):
        tid = self.tournament_id
        if tid in _game_tasks:
            return

        tournament = await self._get_tournament()
        if tournament is None or tournament.status != "running":
            return

        players_qs = await self._get_players()
        if len(players_qs) < 2:
            return

        engine_players = []
        for tp in sorted(players_qs, key=lambda t: t.seat):
            ep = EnginePlayer(name=tp.user.username, chips=tp.chips, is_human=True)
            ep._tp_id   = tp.id
            ep._user_id = tp.user_id
            ep._seat    = tp.seat
            engine_players.append(ep)

        _engine_players[tid] = engine_players

        levels_data = await self._get_levels()

        for ep in engine_players:
            key = (tid, ep._user_id)
            _action_queues.setdefault(key, asyncio.Queue())

        group = self.group_name

        runner = TournamentRunner(
            players          = engine_players,
            levels           = levels_data,
            broadcast        = _make_broadcast(tid, group),
            request_action   = _make_request_action(tid, group),
            on_hand_complete = _make_on_hand_complete(tid),
        )

        _tournament_runners[tid] = runner
        _game_tasks[tid] = asyncio.create_task(_run_tournament(tid, group, runner))

    # ── player action ──────────────────────────────────────────────────

    async def _handle_action(self, data):
        key = (self.tournament_id, self.user.id)
        queue = _action_queues.get(key)
        if queue:
            await queue.put((data.get("action", "fold"), data.get("amount", 0)))

    # ── snapshot for reconnect ─────────────────────────────────────────

    async def _send_snapshot(self):
        tid = self.tournament_id
        players = _engine_players.get(tid, [])
        gs = _game_state.get(tid, {})
        my_cards = []
        for ep in players:
            if ep._user_id == self.user.id and ep.hole_cards:
                my_cards = cards_to_list(ep.hole_cards)
                break
        data = {
            "type": "game_state",
            "players": [
                {
                    "seat":          ep._seat,
                    "name":          ep.name,
                    "chips":         ep.chips,
                    "is_eliminated": ep.is_eliminated,
                    "is_folded":     ep.is_folded,
                    "is_all_in":     ep.is_all_in,
                    "is_disconnected": (tid, ep._user_id) not in _player_channels,
                }
                for ep in players
            ],
            "community_cards": gs.get("community_cards", []),
            "pot":             gs.get("pot", 0),
            "street":          gs.get("street"),
            "hand_number":     gs.get("hand_number", 0),
            "hole_cards":      my_cards,
        }
        await self.send(text_data=json.dumps(data))

    def _find_engine_player(self):
        """Find the engine Player object for this consumer's user."""
        players = _engine_players.get(self.tournament_id, [])
        for ep in players:
            if ep._user_id == self.user.id:
                return ep
        return None

    # ── group message handler ──────────────────────────────────────────

    async def game_message(self, event):
        await self.send(text_data=event["data"])

    # ── DB helpers (only used during _handle_start) ────────────────────

    @database_sync_to_async
    def _get_tournament(self):
        try:
            return Tournament.objects.get(id=self.tournament_id)
        except Tournament.DoesNotExist:
            return None

    @database_sync_to_async
    def _get_players(self):
        return list(
            TournamentPlayer.objects
            .filter(tournament_id=self.tournament_id)
            .select_related("user")
            .order_by("seat")
        )

    @database_sync_to_async
    def _get_levels(self):
        return list(
            BlindLevel.objects
            .filter(tournament_id=self.tournament_id)
            .order_by("level_number")
            .values("small_blind", "big_blind", "ante", "duration_hands", "duration_minutes")
        )
