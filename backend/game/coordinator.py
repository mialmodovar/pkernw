"""Multi-table tournament coordinator."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Dict, List, Optional

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
    ):
        self.tournament_id = tournament_id
        self.players_per_table = players_per_table
        self.levels = levels
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
        self._level_start_time = 0.0
        self._standings: List[EnginePlayer] = []

    @property
    def current_blind_level_number(self) -> int:
        count = 0
        for idx in range(0, min(self._level_index, len(self.levels) - 1) + 1):
            if not self.levels[idx].get("is_break"):
                count += 1
        return count

    async def run(self) -> List[EnginePlayer]:
        self._level_start_time = time.monotonic()
        await self._sync_players_from_db()
        await self._rebalance_tables()

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
            await self._sync_players_from_db()
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

            await self.persist_player_states(list(self._players_by_id.values()))
            self._hands_in_level += 1
            self._advance_level()
            await asyncio.sleep(3)

        winner = next(
            player for player in self._players_by_id.values() if not player.is_eliminated and player.chips > 0
        )
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
        return {
            "type": "game_state",
            "players": [self._player_payload(runtime_player) for runtime_player in table.players],
            "community_cards": state.get("community_cards", []),
            "pot": state.get("pot", 0),
            "street": state.get("street"),
            "hand_number": state.get("hand_number", 0),
            "hole_cards": cards_to_list(player.hole_cards) if player.hole_cards else [],
            "current_table_number": table.table_number,
            "current_table_id": table.table_id,
            "table_count": len(self._tables),
            "table_summaries": self.table_summaries(),
        }

    def get_runtime_player(self, user_id: int) -> Optional[EnginePlayer]:
        return self._players_by_user_id.get(user_id)

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
            request_action=lambda player, context: self.request_action(
                table.table_number,
                player,
                {**context, "table_number": table.table_number, "table_id": table.table_id},
            ),
        )
        result = await engine.run()
        table.hand_number += 1
        table.dealer_idx = (table.dealer_idx + 1) % max(1, len([player for player in players if player.chips > 0]))
        table.players = players
        return [player for player in result.busted_players if player.chips == 0]

    async def _broadcast_to_table(self, table_number: int, event_type: str, payload: dict):
        state = self._table_states.setdefault(
            table_number,
            {"community_cards": [], "pot": 0, "street": None, "hand_number": 0},
        )

        if event_type == "hand_started":
            state["community_cards"] = []
            state["pot"] = 0
            state["street"] = "preflop"
            state["hand_number"] = payload.get("hand_number", state["hand_number"])
        elif event_type == "street_dealt":
            state["community_cards"] = payload.get("cards", [])
            state["pot"] = payload.get("pot", state["pot"])
            state["street"] = payload.get("street", state["street"])
        elif event_type == "hand_complete":
            state["pot"] = 0

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
        enriched_payload = {
            **payload,
            "table_number": table_number,
            "table_id": table.table_id if table else None,
        }
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
        for remaining in range(total_seconds, 0, -1):
            await self.broadcast_tournament("break_tick", {"remaining_seconds": remaining})
            await asyncio.sleep(1)
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
            elapsed = time.monotonic() - self._level_start_time
            payload["duration_minutes"] = level["duration_minutes"]
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
            "is_eliminated": player.is_eliminated,
            "is_folded": player.is_folded,
            "is_all_in": player.is_all_in,
        }