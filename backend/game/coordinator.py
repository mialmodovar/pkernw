"""Multi-table tournament coordinator."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional

from .engine.hand import HandEngine, cards_to_list
from .engine.player import Player as EnginePlayer


TournamentBroadcastFn = Callable[[str, dict], Awaitable[None]]
TableBroadcastFn = Callable[[int, str, dict], Awaitable[None]]
TableRequestFn = Callable[[int, EnginePlayer, dict], Awaitable[tuple[str, int]]]
NotifyUserFn = Callable[[int, dict], Awaitable[None]]
LoadPlayersFn = Callable[[], Awaitable[List[dict]]]
PersistAssignmentsFn = Callable[[List[dict], List[int]], Awaitable[Dict[int, dict]]]
PersistPlayerStatesFn = Callable[[List[EnginePlayer]], Awaitable[None]]


@dataclass
class RuntimeTable:
    table_number: int
    table_id: Optional[int] = None
    max_seats: int = 9
    players: List[EnginePlayer] = field(default_factory=list)
    dealer_idx: int = 0
    hand_number: int = 0


class MultiTableTournamentCoordinator:
    def __init__(
        self,
        tournament_id: int,
        players_per_table: int,
        levels: List[Dict[str, int]],
        broadcast_tournament: TournamentBroadcastFn,
        broadcast_table: TableBroadcastFn,
        request_action: TableRequestFn,
        notify_user: NotifyUserFn,
        load_players: LoadPlayersFn,
        persist_assignments: PersistAssignmentsFn,
        persist_player_states: PersistPlayerStatesFn,
        time_bank_seconds: int = 0,
        time_bank_refill_rule: str = "none",
        time_bank_refill_every_hands: Optional[int] = None,
        time_bank_refill_level: Optional[int] = None,
        rabbit_hunting_enabled: bool = False,
        auto_remove_offline_seconds: int = 0,
    ):
        self.tournament_id = tournament_id
        self.players_per_table = players_per_table
        self.levels = levels
        self.time_bank_seconds = max(0, time_bank_seconds or 0)
        self.time_bank_refill_rule = time_bank_refill_rule or "none"
        self.time_bank_refill_every_hands = time_bank_refill_every_hands
        self.time_bank_refill_level = time_bank_refill_level
        self.rabbit_hunting_enabled = rabbit_hunting_enabled
        self.auto_remove_offline_seconds = max(0, auto_remove_offline_seconds or 0)
        self.broadcast_tournament = broadcast_tournament
        self.broadcast_table = broadcast_table
        self.request_action = request_action
        self.notify_user = notify_user
        self.load_players = load_players
        self.persist_assignments = persist_assignments
        self.persist_player_states = persist_player_states

        self._players_by_id: Dict[int, EnginePlayer] = {}
        self._players_by_user_id: Dict[int, EnginePlayer] = {}
        self._tables: Dict[int, RuntimeTable] = {}
        self._table_states: Dict[int, dict] = {}
        self._level_index = 0
        self._hands_in_level = 0
        self._hands_played = 0
        self._level_start_time = 0.0
        self._standings: List[EnginePlayer] = []
        self._refilled_blind_levels = set()
        self._offline_since: Dict[int, float] = {}
        self.is_paused = False
        self._paused_at: Optional[float] = None
        # Set once the winner is being decided, so a rebuy can't slip in after
        # the tournament has effectively ended.
        self._finishing = False

    @property
    def current_blind_level_number(self) -> int:
        count = 0
        for idx in range(0, min(self._level_index, len(self.levels) - 1) + 1):
            if not self.levels[idx].get("is_break"):
                count += 1
        return count

    async def run(self) -> List[EnginePlayer]:
        await self._sync_players_from_db()
        await self._rebalance_tables()

        # A tournament can boot already paused (the server restarted while it
        # was paused), so hold here until the host resumes rather than dealing.
        # The level clock only starts once we are actually under way.
        await self._wait_if_paused()
        self._level_start_time = time.monotonic()

        await self.broadcast_tournament(
            "tournament_started",
            {
                "level": self._level_payload(),
                "table_count": len(self._tables),
                "tables": self.table_summaries(),
            },
        )

        for remaining in range(30, 0, -1):
            await self.broadcast_tournament("countdown", {"seconds": remaining})
            await asyncio.sleep(1)
        await self.broadcast_tournament("countdown", {"seconds": 0})

        while self._active_player_count() > 1:
            await self._wait_if_paused()
            await self._sync_players_from_db()
            await self._remove_timed_out_offline_players()
            await self._rebalance_tables()

            level = self._current_level()
            await self.broadcast_tournament(
                "level_change",
                {
                    **self._level_payload(),
                    "table_count": len(self._tables),
                    "tables": self.table_summaries(),
                },
            )

            if level.get("is_break"):
                await self._run_break(level)
                continue

            playable_tables = [table for table in self._tables.values() if len(table.players) > 1]
            if not playable_tables:
                await asyncio.sleep(1)
                continue

            active_before = self._active_player_count()
            results = await asyncio.gather(*(self._run_table_hand(table, level) for table in playable_tables))

            busted: List[EnginePlayer] = []
            seen = set()
            for table_busted in results:
                for player in table_busted:
                    if player._tp_id in seen or player.chips > 0:
                        continue
                    seen.add(player._tp_id)
                    busted.append(player)

            remaining_count = active_before
            for player in sorted(busted, key=lambda item: (item._table_number, item._seat, item._tp_id)):
                if player.is_eliminated:
                    continue
                player.is_eliminated = True
                player.finish_position = remaining_count
                remaining_count -= 1
                self._standings.append(player)
                await self._broadcast_to_table(
                    player._table_number,
                    "player_eliminated",
                    {
                        "seat": player._seat,
                        "name": player.name,
                        "finish_position": player.finish_position,
                    },
                )

            self._hands_in_level += 1
            self._hands_played += 1
            self._refill_time_banks_after_hand()
            self._advance_level()
            await self.persist_player_states(list(self._players_by_id.values()))
            await asyncio.sleep(3)

        self._finishing = True
        winner = next(
            player for player in self._players_by_id.values() if not player.is_eliminated and player.chips > 0
        )
        # Busted players get a finish position as they go out, but the winner
        # never did — so finished tournaments had no recorded first place.
        winner.finish_position = 1
        standings = [winner] + list(reversed(self._standings))
        await self.persist_player_states(list(self._players_by_id.values()))
        await self.broadcast_tournament(
            "tournament_complete",
            {
                "standings": [
                    {
                        "seat": player._global_seat,
                        "name": player.name,
                        "finish": index + 1,
                    }
                    for index, player in enumerate(standings)
                ]
            },
        )
        return standings

    async def snapshot_for_user(self, user_id: int) -> Optional[dict]:
        player = self._players_by_user_id.get(user_id)
        if player is None:
            await self._sync_players_from_db()
            player = self._players_by_user_id.get(user_id)
        if player is None:
            return None

        table = self._tables.get(player._table_number)
        if table is None:
            await self._rebalance_tables()
            table = self._tables.get(player._table_number)
        if table is None:
            return None

        state = self._table_states.get(table.table_number, {})
        bets = state.get("bets", {})
        return {
            "type": "game_state",
            "players": [
                {**self._player_payload(rp), "bet": bets.get(rp._seat, 0)}
                for rp in table.players
            ],
            "community_cards": state.get("community_cards", []),
            # Uncollected street bets are still live money, so the reconnecting
            # client sees the same pot as everyone else.
            "pot": state.get("pot", 0) + sum(bets.values()),
            "street": state.get("street"),
            "hand_number": state.get("hand_number", 0),
            "dealer_seat": state.get("dealer_seat"),
            "sb_seat": state.get("sb_seat"),
            "bb_seat": state.get("bb_seat"),
            "action_on_seat": state.get("action_on_seat"),
            "hole_cards": cards_to_list(player.hole_cards) if player.hole_cards else [],
            "current_table_number": table.table_number,
            "current_table_id": table.table_id,
            "table_count": len(self._tables),
            "table_summaries": self.table_summaries(),
            "is_paused": self.is_paused,
            # Included so a client joining or reconnecting mid-tournament gets
            # the blind level straight away, instead of waiting for the next
            # level_change broadcast.
            "level": self._level_payload(),
        }

    def get_runtime_player(self, user_id: int) -> Optional[EnginePlayer]:
        return self._players_by_user_id.get(user_id)

    async def mark_player_disconnected(self, user_id: int):
        self._offline_since.setdefault(user_id, time.monotonic())

    async def mark_player_reconnected(self, user_id: int):
        self._offline_since.pop(user_id, None)

    async def set_sitting_out(self, user_id: int, value: bool) -> bool:
        player = self._players_by_user_id.get(user_id)
        if player is None:
            return False
        player.is_sitting_out = bool(value)
        await self._broadcast_to_table(
            player._table_number,
            "player_sitting_out",
            {"seat": player._seat, "name": player.name, "sitting_out": player.is_sitting_out},
        )
        return True

    async def apply_rebuy(self, user_id: int, chips: int) -> str:
        """Bring an eliminated player back with a fresh stack.

        Returns an empty string on success, or the reason it was refused.

        This has to go through the coordinator rather than the DB alone: the
        run loop writes its in-memory players over the DB after every hand
        (`persist_player_states`), so a DB-only rebuy is silently reverted.
        """
        if self._finishing:
            return "Tournament has ended"
        player = self._players_by_user_id.get(user_id)
        if player is None:
            return "The engine does not know this player"

        # Deliberately not re-checking is_eliminated here. The caller has
        # already decided eligibility from the DB row under select_for_update,
        # which is the single source of truth; the in-memory copy lags it (it is
        # only refreshed between hands) and re-checking it here just races the
        # caller and refuses valid rebuys.

        player.chips = chips
        player.is_eliminated = False
        player.finish_position = 0
        # A stale standings entry would list them twice in the final results.
        self._standings = [p for p in self._standings if p._tp_id != player._tp_id]

        await self.persist_player_states(list(self._players_by_id.values()))
        await self.broadcast_tournament(
            "player_rebuy",
            {"name": player.name, "chips": chips},
        )
        return ""

    def table_summaries(self) -> List[dict]:
        return [
            {
                "table_number": table.table_number,
                "table_id": table.table_id,
                "player_count": len(table.players),
                "max_seats": table.max_seats,
            }
            for table in sorted(self._tables.values(), key=lambda item: item.table_number)
        ]

    async def _sync_players_from_db(self):
        records = await self.load_players()
        for record in records:
            runtime_player = self._players_by_id.get(record["id"])
            if runtime_player is None:
                runtime_player = EnginePlayer(name=record["username"], chips=record["chips"], is_human=True)
                runtime_player._tp_id = record["id"]
                self._players_by_id[record["id"]] = runtime_player

            runtime_player.name = record["username"]
            runtime_player.chips = record["chips"]
            runtime_player.is_eliminated = record["is_eliminated"]
            runtime_player.finish_position = record["finish_position"] or 0
            runtime_player.time_bank_seconds_remaining = record["time_bank_seconds_remaining"] or 0
            runtime_player._user_id = record["user_id"]
            runtime_player._table_id = record["table_id"]
            runtime_player._table_number = record["table_number"] or 1
            runtime_player._global_seat = record["seat"]
            runtime_player._seat = record["seat_at_table"] if record["seat_at_table"] is not None else record["seat"]

            self._players_by_user_id[runtime_player._user_id] = runtime_player

    async def _rebalance_tables(self):
        active_players = [
            player for player in self._players_by_id.values() if not player.is_eliminated and player.chips > 0
        ]
        if not active_players:
            self._tables = {}
            return

        active_players.sort(key=lambda item: (item._table_number, item._seat, item._tp_id))
        required_tables = max(1, ((len(active_players) - 1) // self.players_per_table) + 1)
        base_size, remainder = divmod(len(active_players), required_tables)
        target_sizes = [base_size + (1 if index < remainder else 0) for index in range(required_tables)]

        old_assignments = {
            player._tp_id: (getattr(player, "_table_number", None), getattr(player, "_seat", None))
            for player in active_players
        }

        layout = []
        grouped_players: Dict[int, List[EnginePlayer]] = {}
        global_seat = 0
        player_index = 0
        for table_index, target_size in enumerate(target_sizes, start=1):
            grouped_players[table_index] = []
            for seat_at_table in range(target_size):
                player = active_players[player_index]
                player_index += 1
                player._table_number = table_index
                player._seat = seat_at_table
                player._global_seat = global_seat
                global_seat += 1
                grouped_players[table_index].append(player)
                layout.append(
                    {
                        "tp_id": player._tp_id,
                        "table_number": table_index,
                        "seat": player._global_seat,
                        "seat_at_table": seat_at_table,
                    }
                )

        active_table_numbers = list(grouped_players.keys())
        table_meta = await self.persist_assignments(layout, active_table_numbers)

        previous_tables = self._tables
        self._tables = {}
        for table_number, players in grouped_players.items():
            previous = previous_tables.get(table_number)
            meta = table_meta.get(table_number, {})
            self._tables[table_number] = RuntimeTable(
                table_number=table_number,
                table_id=meta.get("id"),
                max_seats=meta.get("max_seats", self.players_per_table),
                players=players,
                dealer_idx=0 if previous is None else min(previous.dealer_idx, max(0, len(players) - 1)),
                hand_number=0 if previous is None else previous.hand_number,
            )
            self._table_states.setdefault(table_number, {"community_cards": [], "pot": 0, "street": None, "hand_number": 0})

        changed_players = [
            player for player in active_players if old_assignments.get(player._tp_id) != (player._table_number, player._seat)
        ]
        for player in changed_players:
            table = self._tables[player._table_number]
            await self.notify_user(
                player._user_id,
                {
                    "type": "table_assignment",
                    "table_number": table.table_number,
                    "table_id": table.table_id,
                    "seat": player._seat,
                    "global_seat": player._global_seat,
                    "table_count": len(self._tables),
                    "table_summaries": self.table_summaries(),
                },
            )

        await self.broadcast_tournament(
            "table_rebalanced",
            {"table_count": len(self._tables), "tables": self.table_summaries()},
        )

    async def _run_table_hand(self, table: RuntimeTable, level: Dict[str, int]) -> List[EnginePlayer]:
        players = sorted(table.players, key=lambda item: item._seat)
        if len(players) < 2:
            return []

        engine = HandEngine(
            players=players,
            dealer_pos=table.dealer_idx % len(players),
            small_blind=level["small_blind"],
            big_blind=level["big_blind"],
            ante=level["ante"],
            hand_number=table.hand_number + 1,
            broadcast=lambda event_type, payload: self._broadcast_to_table(table.table_number, event_type, payload),
            request_action=lambda player, context: self._request_action_tracked(table, player, context),
            rabbit_hunting_enabled=self.rabbit_hunting_enabled,
        )
        result = await engine.run()
        table.hand_number += 1
        table.dealer_idx = (table.dealer_idx + 1) % max(1, len([player for player in players if player.chips > 0]))
        table.players = players
        return [player for player in result.busted_players if player.chips == 0]

    async def _request_action_tracked(self, table, player, context):
        """Ask a player to act, remembering whose turn it is for reconnects."""
        state = self._table_state(table.table_number)
        state["action_on_seat"] = context.get("seat")
        try:
            return await self.request_action(
                table.table_number,
                player,
                {
                    **context,
                    "table_number": table.table_number,
                    "table_id": table.table_id,
                    "action_timer_seconds": 20,
                    "time_bank_seconds_remaining": player.time_bank_seconds_remaining,
                },
            )
        finally:
            state["action_on_seat"] = None

    def _table_state(self, table_number: int) -> dict:
        return self._table_states.setdefault(
            table_number,
            {
                "community_cards": [], "pot": 0, "street": None, "hand_number": 0,
                # Tracked so a reconnecting client can be handed a table that
                # still reads correctly mid-hand.
                "dealer_seat": None, "sb_seat": None, "bb_seat": None,
                "bets": {}, "action_on_seat": None,
            },
        )

    async def _broadcast_to_table(self, table_number: int, event_type: str, payload: Any):
        state = self._table_state(table_number)

        if event_type == "hand_started":
            state["community_cards"] = []
            state["pot"] = 0
            state["street"] = "preflop"
            state["hand_number"] = payload.get("hand_number", state["hand_number"])
            state["dealer_seat"] = payload.get("dealer_seat")
            state["sb_seat"] = None
            state["bb_seat"] = None
            state["bets"] = {}
        elif event_type == "blinds_posted":
            # Blinds sit in front of the players as street bets, not yet in the pot.
            state["sb_seat"] = payload["sb"]["seat"]
            state["bb_seat"] = payload["bb"]["seat"]
            state["bets"][payload["sb"]["seat"]] = payload["sb"]["amount"]
            state["bets"][payload["bb"]["seat"]] = payload["bb"]["amount"]
        elif event_type == "antes_posted":
            # Antes go straight to the pot.
            state["pot"] += sum(entry.get("amount", 0) for entry in (payload or []))
        elif event_type == "action_taken":
            seat = payload.get("seat")
            action = payload.get("action")
            amount = payload.get("amount", 0)
            if action == "call":
                state["bets"][seat] = state["bets"].get(seat, 0) + amount
            elif action in ("bet", "raise"):
                state["bets"][seat] = amount  # total street bet, not an increment
        elif event_type == "street_dealt":
            state["community_cards"] = payload.get("cards", [])
            state["pot"] = payload.get("pot", state["pot"])
            state["street"] = payload.get("street", state["street"])
            state["bets"] = {}  # collected into the pot
        elif event_type == "hand_complete":
            state["pot"] = 0
            state["bets"] = {}
            state["dealer_seat"] = None
            state["sb_seat"] = None
            state["bb_seat"] = None

        if event_type == "hole_cards_dealt":
            for player_data in payload.get("players", []):
                user_id = player_data.get("user_id")
                if user_id is None:
                    continue
                await self.notify_user(
                    user_id,
                    {
                        "type": "hole_cards",
                        "cards": player_data["cards"],
                        "table_number": table_number,
                    },
                )
            return

        table = self._tables.get(table_number)
        if isinstance(payload, dict):
            enriched_payload = {**payload}
        else:
            enriched_payload = {"data": payload}
        enriched_payload.update(
            {
                "table_number": table_number,
                "table_id": table.table_id if table else None,
            }
        )
        await self.broadcast_table(table_number, event_type, enriched_payload)

    async def _run_break(self, level: Dict[str, int]):
        duration_minutes = level.get("duration_minutes") or 0
        total_seconds = duration_minutes * 60
        await self.broadcast_tournament(
            "break_started",
            {
                **self._level_payload(),
                "table_count": len(self._tables),
                "tables": self.table_summaries(),
            },
        )
        remaining = total_seconds
        while remaining > 0:
            await self._wait_if_paused()
            await self.broadcast_tournament("break_tick", {"remaining_seconds": remaining})
            await asyncio.sleep(1)
            remaining -= 1
        await self.broadcast_tournament("break_tick", {"remaining_seconds": 0})
        self._set_next_level()

    def _active_player_count(self) -> int:
        return sum(1 for player in self._players_by_id.values() if not player.is_eliminated and player.chips > 0)

    def _current_level(self) -> Dict[str, int]:
        return self.levels[min(self._level_index, len(self.levels) - 1)]

    def _advance_level(self):
        if self._level_index >= len(self.levels) - 1:
            return
        level = self._current_level()
        if level.get("duration_minutes"):
            elapsed = time.monotonic() - self._level_start_time
            if elapsed >= level["duration_minutes"] * 60:
                self._set_next_level()
        else:
            duration = level.get("duration_hands") or 8
            if self._hands_in_level >= duration:
                self._set_next_level()

    def _set_next_level(self):
        if self._level_index >= len(self.levels) - 1:
            return
        self._level_index += 1
        self._hands_in_level = 0
        self._level_start_time = time.monotonic()
        self._refill_time_banks_for_level()

    async def pause(self) -> dict:
        if not self.is_paused:
            self.is_paused = True
            self._paused_at = time.monotonic()
        payload = {"status": "paused", "level": self._level_payload()}
        await self.broadcast_tournament("tournament_paused", payload)
        return payload

    async def resume(self) -> dict:
        if self.is_paused and self._paused_at is not None:
            self._level_start_time += time.monotonic() - self._paused_at
        self.is_paused = False
        self._paused_at = None
        payload = {"status": "running", "level": self._level_payload()}
        await self.broadcast_tournament("tournament_resumed", payload)
        return payload

    async def skip_level(self) -> dict:
        previous_index = self._level_index
        self._set_next_level()
        payload = {
            **self._level_payload(),
            "skipped": self._level_index != previous_index,
            "table_count": len(self._tables),
            "tables": self.table_summaries(),
        }
        await self.broadcast_tournament("level_change", payload)
        return payload

    async def _wait_if_paused(self):
        while self.is_paused:
            await asyncio.sleep(0.5)

    def _level_payload(self) -> dict:
        level = self._current_level()
        payload = {
            "level_index": self._level_index,
            "blind_level_number": self.current_blind_level_number,
            "is_break": bool(level.get("is_break")),
            "small_blind": level["small_blind"],
            "big_blind": level["big_blind"],
            "ante": level["ante"],
            "hands_in_level": self._hands_in_level,
        }
        if level.get("duration_minutes"):
            payload["duration_minutes"] = level["duration_minutes"]
            if not self._level_start_time:
                # The level clock has not started yet (tournament booted paused).
                payload["remaining_seconds"] = level["duration_minutes"] * 60
            else:
                now = self._paused_at if self.is_paused and self._paused_at is not None else time.monotonic()
                elapsed = now - self._level_start_time
                payload["remaining_seconds"] = int(max(0, level["duration_minutes"] * 60 - elapsed))
        else:
            payload["duration_hands"] = level.get("duration_hands") or 8
        return payload

    def _player_payload(self, player: EnginePlayer) -> dict:
        return {
            "seat": player._seat,
            "global_seat": player._global_seat,
            "table_number": player._table_number,
            "name": player.name,
            "chips": player.chips,
            "time_bank_seconds_remaining": player.time_bank_seconds_remaining,
            "is_eliminated": player.is_eliminated,
            "is_folded": player.is_folded,
            "is_all_in": player.is_all_in,
            # In the payload so it survives a game_state snapshot, unlike the
            # client-only is_disconnected flag.
            "is_sitting_out": player.is_sitting_out,
        }

    def _refill_time_banks_after_hand(self):
        if (
            self.time_bank_seconds <= 0
            or self.time_bank_refill_rule != "hands"
            or not self.time_bank_refill_every_hands
        ):
            return
        if self._hands_played % self.time_bank_refill_every_hands == 0:
            self._refill_time_banks()

    def _refill_time_banks_for_level(self):
        if (
            self.time_bank_seconds <= 0
            or self.time_bank_refill_rule != "blind_level"
            or not self.time_bank_refill_level
        ):
            return
        blind_level_number = self.current_blind_level_number
        if self._current_level().get("is_break") or blind_level_number != self.time_bank_refill_level:
            return
        if blind_level_number in self._refilled_blind_levels:
            return
        self._refilled_blind_levels.add(blind_level_number)
        self._refill_time_banks()

    def _refill_time_banks(self):
        for player in self._players_by_id.values():
            if not player.is_eliminated and player.chips > 0:
                player.time_bank_seconds_remaining = self.time_bank_seconds

    async def _remove_timed_out_offline_players(self):
        if self.auto_remove_offline_seconds <= 0 or not self._offline_since:
            return

        now = time.monotonic()
        timed_out_players = []
        for user_id, disconnected_at in list(self._offline_since.items()):
            if now - disconnected_at < self.auto_remove_offline_seconds:
                continue
            player = self._players_by_user_id.get(user_id)
            if player is None or player.is_eliminated or player.chips <= 0:
                self._offline_since.pop(user_id, None)
                continue
            timed_out_players.append(player)

        if not timed_out_players:
            return

        remaining_count = self._active_player_count()
        for player in sorted(timed_out_players, key=lambda item: (item._table_number, item._seat, item._tp_id)):
            player.chips = 0
            player.is_eliminated = True
            player.finish_position = remaining_count
            remaining_count -= 1
            self._standings.append(player)
            self._offline_since.pop(player._user_id, None)
            await self._broadcast_to_table(
                player._table_number,
                "player_eliminated",
                {
                    "seat": player._seat,
                    "name": player.name,
                    "finish_position": player.finish_position,
                    "reason": "offline_timeout",
                },
            )

        await self.persist_player_states(list(self._players_by_id.values()))
