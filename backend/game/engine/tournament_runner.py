"""Async tournament runner — drives HandEngine, manages levels and eliminations."""

from __future__ import annotations
import asyncio
import time
from typing import Any, Callable, Coroutine, Dict, List, Optional, Tuple

from .player import Player
from .hand import HandEngine, BroadcastFn, RequestActionFn, cards_to_list


def _seat_of(player: Player) -> int:
    return getattr(player, "_seat", 0)


class TournamentRunner:
    """Runs a full tournament asynchronously, communicating only via callbacks."""

    def __init__(
        self,
        players:          List[Player],
        levels:           List[Dict[str, int]],
        broadcast:        BroadcastFn,
        request_action:   RequestActionFn,
        on_hand_complete: Optional[Callable[["TournamentRunner"], Coroutine]] = None,
    ):
        self.players          = players
        self.levels           = levels
        self.broadcast        = broadcast
        self.request_action   = request_action
        self.on_hand_complete = on_hand_complete

        self._hand_number     = 0
        self._level_index     = 0
        self._hands_in_level  = 0
        self._dealer_idx      = 0
        self._level_start_time: float = 0.0
        self._standings: List[Player] = []

    @property
    def current_blind_level_number(self) -> int:
        count = 0
        for idx in range(0, min(self._level_index, len(self.levels) - 1) + 1):
            if not self.levels[idx].get("is_break"):
                count += 1
        return count

    async def run(self) -> List[Player]:
        self._level_start_time = time.monotonic()

        await self.broadcast("tournament_started", {
            "players": [
                {"seat": _seat_of(p), "name": p.name, "chips": p.chips}
                for p in self.players
            ],
            "level": self._level_payload(),
        })

        # 30-second countdown so all players can connect
        for remaining in range(30, 0, -1):
            await self.broadcast("countdown", {"seconds": remaining})
            await asyncio.sleep(1)
        await self.broadcast("countdown", {"seconds": 0})

        while len(self._active_players()) > 1:
            active = self._active_players()
            level  = self._current_level()

            if self._hands_in_level == 0:
                await self.broadcast("level_change", self._level_payload())

            if level.get("is_break"):
                await self._run_break(level)
                continue

            engine = HandEngine(
                players        = active,
                dealer_pos     = self._dealer_idx % len(active),
                small_blind    = level["small_blind"],
                big_blind      = level["big_blind"],
                ante           = level["ante"],
                hand_number    = self._hand_number + 1,
                broadcast      = self.broadcast,
                request_action = self.request_action,
            )
            result = await engine.run()
            self._hand_number    += 1
            self._hands_in_level += 1

            for p in result.busted_players:
                if p.chips == 0 and not p.is_eliminated:
                    remaining = len(self._active_players()) - 1
                    p.is_eliminated   = True
                    p.finish_position = remaining + 1
                    self._standings.append(p)
                    await self.broadcast("player_eliminated", {
                        "seat": _seat_of(p),
                        "name": p.name,
                        "finish_position": p.finish_position,
                    })

            if self.on_hand_complete:
                await self.on_hand_complete(self)

            self._dealer_idx = (self._dealer_idx + 1) % max(1, len(self._active_players()))
            self._advance_level()

            # Pause so players can see the round result before next hand
            await asyncio.sleep(3)

        winner = self._active_players()[0]
        standings = [winner] + list(reversed(self._standings))
        await self.broadcast("tournament_complete", {
            "standings": [
                {"seat": _seat_of(p), "name": p.name, "finish": i + 1}
                for i, p in enumerate(standings)
            ],
        })
        return standings

    def _active_players(self) -> List[Player]:
        return [p for p in self.players if not p.is_eliminated]

    def _current_level(self) -> Dict[str, int]:
        idx = min(self._level_index, len(self.levels) - 1)
        return self.levels[idx]

    def _is_time_based(self, level: dict) -> bool:
        return bool(level.get("duration_minutes"))

    def _advance_level(self):
        if self._level_index >= len(self.levels) - 1:
            return
        level = self._current_level()
        if self._is_time_based(level):
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

    async def _run_break(self, level: Dict[str, int]):
        duration_minutes = level.get("duration_minutes") or 0
        total_seconds = duration_minutes * 60
        await self.broadcast("break_started", self._level_payload())

        for remaining in range(total_seconds, 0, -1):
            await self.broadcast("break_tick", {"remaining_seconds": remaining})
            await asyncio.sleep(1)

        await self.broadcast("break_tick", {"remaining_seconds": 0})
        self._set_next_level()

    def _level_payload(self) -> dict:
        lvl = self._current_level()
        payload = {
            "level_index":    self._level_index,
            "blind_level_number": self.current_blind_level_number,
            "is_break":       bool(lvl.get("is_break")),
            "small_blind":    lvl["small_blind"],
            "big_blind":      lvl["big_blind"],
            "ante":           lvl["ante"],
            "hands_in_level": self._hands_in_level,
        }
        if self._is_time_based(lvl):
            elapsed = time.monotonic() - self._level_start_time
            remaining = max(0, lvl["duration_minutes"] * 60 - elapsed)
            payload["duration_minutes"]   = lvl["duration_minutes"]
            payload["remaining_seconds"]  = int(remaining)
        else:
            payload["duration_hands"] = lvl.get("duration_hands") or 8
        return payload
