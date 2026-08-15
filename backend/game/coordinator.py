"""Multi-table tournament coordinator."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional

from tournaments.bounties import BountyConfig, split_knockout

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
        persist_progress: Optional[Callable[[int, int], Awaitable[None]]] = None,
        persist_hand: Optional[Callable[[dict], Awaitable[None]]] = None,
        level_index: int = 0,
        hands_in_level: int = 0,
        time_bank_seconds: int = 0,
        time_bank_refill_rule: str = "none",
        time_bank_refill_every_hands: Optional[int] = None,
        time_bank_refill_level: Optional[int] = None,
        rabbit_hunting_enabled: bool = False,
        auto_remove_offline_seconds: int = 0,
        bounty: Optional[BountyConfig] = None,
        showdown_seconds: Optional[float] = None,
        allow_rebuys: bool = False,
        max_rebuys: int = 0,
        rebuy_level: int = 0,
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
        self.bounty = bounty or BountyConfig()
        # How long the table holds between hands. Configurable per tournament:
        # a table of friends reading each other's cards wants longer than one
        # grinding through levels.
        self.showdown_seconds = float(
            self.INTER_HAND_SECONDS if showdown_seconds is None else max(1.0, showdown_seconds)
        )
        # Enough of the rebuy rules to know whether busting somebody is worth
        # holding the table for. The REST endpoint stays the authority on
        # whether a particular rebuy is allowed; this only decides whether to
        # wait and who to ask.
        self.allow_rebuys = bool(allow_rebuys)
        self.max_rebuys = max(0, max_rebuys or 0)
        self.rebuy_level = max(0, rebuy_level or 0)
        self.broadcast_tournament = broadcast_tournament
        self.broadcast_table = broadcast_table
        self.request_action = request_action
        self.notify_user = notify_user
        self.load_players = load_players
        self.persist_assignments = persist_assignments
        self.persist_player_states = persist_player_states
        self.persist_progress = persist_progress
        self.persist_hand = persist_hand

        self._players_by_id: Dict[int, EnginePlayer] = {}
        self._players_by_user_id: Dict[int, EnginePlayer] = {}
        self._tables: Dict[int, RuntimeTable] = {}
        self._table_states: Dict[int, dict] = {}
        # Resumed from the DB, so a restart picks up the blind level and the
        # hand count that play had actually reached.
        self._level_index = max(0, min(level_index, max(0, len(levels) - 1)))
        self._hands_in_level = max(0, hands_in_level)
        self._hands_played = 0
        self._level_start_time = 0.0
        self._standings: List[EnginePlayer] = []
        self._refilled_blind_levels = set()
        self._offline_since: Dict[int, float] = {}
        # Who has said they are ready, and whether saying so still means
        # anything. Only open during the pre-tournament countdown.
        self._ready_user_ids: set[int] = set()
        self._countdown_open = False
        # The gap between hands, and whether cards can still be shown in it.
        # The deadline is a monotonic timestamp rather than a duration so a
        # reveal can push it back while the wait is already running.
        self._show_open = False
        self._show_deadline = 0.0
        self._shown_this_hand: set[int] = set()
        # A separate deadline from the one above: the reveal window is capped
        # against a player showing card after card to stall the table, and a
        # rebuy has nothing to do with that cap.
        self._rebuy_deadline = 0.0
        self._rebuy_pending: set[int] = set()
        self.is_paused = False
        self._paused_at: Optional[float] = None
        # Set once the winner is being decided, so a rebuy can't slip in after
        # the tournament has effectively ended.
        self._finishing = False
        # What the tournament should hold in total, adjusted whenever chips
        # legitimately enter or leave. See _check_chip_total.
        self._expected_chip_total = 0
        self._chip_total_known = False

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

        # Thirty seconds is there so everyone has time to load the table, not
        # because the table needs it. When every player says they are ready
        # there is nothing left to wait for, so the count stops early.
        self._countdown_open = True
        await self._broadcast_ready_state()
        for remaining in range(30, 0, -1):
            if self._everyone_ready():
                await self.broadcast_tournament("countdown", {"seconds": 0, "reason": "all_ready"})
                break
            await self.broadcast_tournament("countdown", {"seconds": remaining})
            await asyncio.sleep(1)
        else:
            await self.broadcast_tournament("countdown", {"seconds": 0})
        # Nobody can be "ready" for a tournament that has started, and leaving
        # the flag up would let a late arrival's click cut short a break.
        self._countdown_open = False

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
                # A break configured as the final level would repeat forever:
                # nothing follows it, so the loop reads the same level again.
                # Drop back to the last playable level, which then runs until
                # somebody wins — the same as any other final level.
                last_playable = self._last_playable_level_index()
                if self._level_index >= len(self.levels) - 1 and last_playable is not None:
                    self._level_index = last_playable
                    continue
                await self._run_break(level)
                continue

            playable_tables = [table for table in self._tables.values() if len(table.players) > 1]
            if not playable_tables:
                await asyncio.sleep(1)
                continue

            active_before = self._active_player_count()
            results = await asyncio.gather(*(self._run_table_hand(table, level) for table in playable_tables))

            # Cards can be shown from the moment the hands are over. What
            # follows — eliminations, bounties, a database write — takes long
            # enough that a player clicking straight away was being refused.
            self._shown_this_hand = set()
            self._show_open = True

            busted: List[EnginePlayer] = []
            seen = set()
            eliminators_by_victim: Dict[int, List[EnginePlayer]] = {}
            for table_busted, table_knockouts in results:
                for victim, eliminators in table_knockouts:
                    eliminators_by_victim.setdefault(victim._tp_id, eliminators)
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
                # remaining_count is now what is left after this bust, so 1 means
                # this knockout ended the tournament.
                eliminators = eliminators_by_victim.get(player._tp_id, [])
                await self._announce_knockout(player, eliminators)
                await self._pay_bounty(
                    player,
                    eliminators,
                    is_final=remaining_count <= 1,
                )

            # Offered before the pause below, so the wait it asks for is the
            # wait the table actually takes.
            await self._offer_rebuys(busted)

            self._check_chip_total(f"after hand {self._hands_played + 1}")
            self._hands_in_level += 1
            self._hands_played += 1
            self._refill_time_banks_after_hand()
            self._advance_level()
            await self.persist_player_states(list(self._players_by_id.values()))
            if self.persist_progress is not None:
                await self.persist_progress(self._level_index, self._hands_in_level)
            await self._inter_hand_pause()

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

    # ─────────────────────────────────────────────────────────────────────────
    # The gap between hands, and showing cards in it
    # ─────────────────────────────────────────────────────────────────────────

    # The default pause between hands, when a tournament does not say. Long
    # enough to read the result and to look at anything somebody showed.
    INTER_HAND_SECONDS = 5.0
    # How long the table waits for somebody who just busted to decide whether
    # they are buying back in. Being told to rebuy and then watching the next
    # hand start without you is the same as not being offered.
    REBUY_WINDOW_SECONDS = 10.0
    # Ten players each showing in turn should not stall the tournament, so the
    # extensions are capped at a multiple of the pause rather than unbounded.
    MAX_GAP_MULTIPLIER = 3

    async def _inter_hand_pause(self) -> None:
        """Wait between hands, longer if anybody shows their cards.

        The whole point of showing a card is that the table sees it, so the
        deal cannot be allowed to land on top of it. Polled rather than slept
        in one go, because the deadline moves while the wait is running.
        """
        started = time.monotonic()
        # Extended already if somebody showed during the bookkeeping above.
        self._show_deadline = max(self._show_deadline, started + self.showdown_seconds)
        self._show_open = True
        try:
            while True:
                now = time.monotonic()
                deadline = max(
                    min(self._show_deadline, started + self.showdown_seconds * self.MAX_GAP_MULTIPLIER),
                    # Capped on its own terms rather than by the reveal cap,
                    # which exists to stop a player stalling a card at a time.
                    min(self._rebuy_deadline, started + self.REBUY_WINDOW_SECONDS),
                )
                if now >= deadline:
                    return
                await asyncio.sleep(min(0.25, deadline - now))
        finally:
            self._show_open = False

    def _can_rebuy(self, player: EnginePlayer) -> bool:
        """Whether it is worth holding the table open for this player.

        The same three questions the rebuy endpoint asks, so the table never
        waits on an offer that would be refused: rebuys are allowed at all, this
        player has one left, and the rebuy period has not closed.
        """
        if not self.allow_rebuys or self._finishing:
            return False
        if getattr(player, "_rebuy_count", 0) >= self.max_rebuys:
            return False
        return self.current_blind_level_number <= self.rebuy_level

    async def _offer_rebuys(self, busted: List[EnginePlayer]) -> None:
        """Hold the table while whoever just busted decides."""
        candidates = [player for player in busted if self._can_rebuy(player)]
        if not candidates:
            return

        self._rebuy_pending = {player._user_id for player in candidates}
        self._rebuy_deadline = time.monotonic() + self.REBUY_WINDOW_SECONDS
        await self.broadcast_tournament(
            "rebuy_window",
            {
                "seconds": int(self.REBUY_WINDOW_SECONDS),
                # Sent to the whole tournament rather than the table: a busted
                # player holds no seat, so the table they were at is no longer
                # theirs to be addressed on.
                "user_ids": sorted(self._rebuy_pending),
            },
        )

    async def show_cards(self, user_id: int, indices: List[int]) -> bool:
        """Show one or both of your cards to the table, after the hand.

        Only between hands: showing a card mid-hand tells the players still
        deciding something they have no right to know, which is why live poker
        does not allow it either.

        Once per hand, so the window cannot be held open indefinitely by one
        player revealing a card at a time.
        """
        if not self._show_open or user_id in self._shown_this_hand:
            return False
        player = self._players_by_user_id.get(user_id)
        if player is None or not player.hole_cards:
            return False

        wanted = sorted({index for index in indices if index in (0, 1)})
        cards = [player.hole_cards[i] for i in wanted if i < len(player.hole_cards)]
        if not cards:
            return False

        self._shown_this_hand.add(user_id)
        # Everyone gets a full pause to look, including whoever shows last.
        self._show_deadline = max(self._show_deadline, time.monotonic() + self.showdown_seconds)
        await self._broadcast_to_table(
            player._table_number,
            "cards_shown",
            {
                "seat": player._seat,
                "name": player.name,
                "cards": cards_to_list(cards),
                # Which of the two, so a single card shows in the right place.
                "indices": wanted[: len(cards)],
            },
        )
        return True

    # ─────────────────────────────────────────────────────────────────────────
    # Ready — the pre-tournament countdown, cut short by agreement
    # ─────────────────────────────────────────────────────────────────────────

    def _seated_user_ids(self) -> set:
        return {
            player._user_id
            for player in self._players_by_id.values()
            if not player.is_eliminated and player.chips > 0 and player._user_id is not None
        }

    def _everyone_ready(self) -> bool:
        """True when every seated player has said so.

        Unanimity among everyone with a seat, not among everyone connected: if
        it were the latter, the first player to load could start the tournament
        on their own while the rest were still opening the page, which is the
        one thing the countdown exists to prevent.

        A player who never connects therefore cannot be ready, and the count
        simply runs out as it always did. That is the fallback, so this can
        never deadlock the start.
        """
        seated = self._seated_user_ids()
        return bool(seated) and seated <= self._ready_user_ids

    async def set_ready(self, user_id: int, value: bool = True) -> bool:
        """Say whether you are ready. Ignored once the tournament is under way."""
        if not self._countdown_open:
            return False
        if value:
            self._ready_user_ids.add(user_id)
        else:
            self._ready_user_ids.discard(user_id)
        await self._broadcast_ready_state()
        return True

    async def _broadcast_ready_state(self) -> None:
        seated = self._seated_user_ids()
        await self.broadcast_tournament(
            "ready_state",
            {
                # Only the seats that count, so a client cannot show 4/3 ready
                # after somebody leaves between the click and the broadcast.
                "ready_user_ids": sorted(self._ready_user_ids & seated),
                "total": len(seated),
            },
        )

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
            # An eliminated player holds no seat, so they had no table and got
            # no snapshot at all — a blank screen. Show them a live table
            # instead, so they can keep watching.
            table = next(iter(sorted(self._tables.values(), key=lambda t: t.table_number)), None)
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
            # So a client that reloads during the countdown gets back the
            # readiness it can see, rather than an empty tally until the next
            # person clicks.
            "ready_user_ids": sorted(self._ready_user_ids & self._seated_user_ids()),
            "ready_total": len(self._seated_user_ids()),
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

        self._expected_chip_total += chips - player.chips
        player.chips = chips
        player.is_eliminated = False
        player.finish_position = 0
        # A rebuy is another buy-in, so it puts another bounty on their head.
        # In a progressive game that is the base amount again — whatever they
        # had grown it to went to whoever knocked them out.
        if self.bounty.enabled:
            player._bounty_cents = getattr(player, "_bounty_cents", 0) + self.bounty.amount_cents
        # A stale standings entry would list them twice in the final results.
        self._standings = [p for p in self._standings if p._tp_id != player._tp_id]

        # They are back, but not in the hand being played — seats are only dealt
        # out at the next rebalance. Until then they sit at the table marked as
        # waiting, because a rebuy that leaves you invisible until the next hand
        # looks like a rebuy that did not work.
        player._waiting_for_hand = True
        self._seat_waiting_player(player)
        # The table was holding for this decision, and it has been made. Once
        # everybody it was waiting on has bought back in, it stops waiting.
        self._rebuy_pending.discard(user_id)
        if not self._rebuy_pending:
            self._rebuy_deadline = 0.0

        await self.persist_player_states(list(self._players_by_id.values()))
        await self.broadcast_tournament(
            "player_rebuy",
            {"name": player.name, "chips": chips},
        )
        await self._broadcast_table_roster(player._table_number)
        return ""

    def _seat_waiting_player(self, player: EnginePlayer) -> None:
        """Give a returning player somewhere to be shown until the next deal.

        Only for display: the table's own player list is left alone, because a
        hand may be running off it and adding to it mid-hand would deal them in
        halfway through. The next rebalance assigns the real seat, which may not
        be this one — the roster it broadcasts then corrects it.
        """
        table = self._tables.get(player._table_number)
        if table is None:
            table = next(iter(sorted(self._tables.values(), key=lambda item: len(item.players))), None)
        if table is None:
            return

        player._table_number = table.table_number
        taken = {seated._seat for seated in table.players}
        free = next((seat for seat in range(table.max_seats) if seat not in taken), None)
        if free is not None:
            player._seat = free

    async def _broadcast_table_roster(self, table_number: int) -> None:
        """Who is at this table right now, waiting players included."""
        table = self._tables.get(table_number)
        if table is None:
            return
        waiting = [
            player for player in self._players_by_id.values()
            if getattr(player, "_waiting_for_hand", False)
            and player._table_number == table_number
            and player not in table.players
        ]
        roster = sorted([*table.players, *waiting], key=lambda item: item._seat)
        await self._broadcast_to_table(
            table_number,
            "table_players",
            {
                "table_number": table_number,
                "players": [self._player_payload(player) for player in roster],
            },
        )

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
            is_new = runtime_player is None
            if runtime_player is None:
                runtime_player = EnginePlayer(name=record["username"], chips=record["chips"], is_human=True)
                runtime_player._tp_id = record["id"]
                self._players_by_id[record["id"]] = runtime_player

            runtime_player.name = record["username"]
            runtime_player._avatar = record.get("avatar") or "\U0001F0CF"
            runtime_player._avatar_url = record.get("avatar_url")
            runtime_player._finisher_gif_id = record.get("finisher_gif_id")
            runtime_player.chips = record["chips"]
            # Only read in on the first sight of a player. This runs before
            # every hand and the DB write happens after it, so re-reading here
            # would roll a bounty won in the last hand straight back.
            if is_new:
                runtime_player._bounty_cents = record.get("bounty_cents") or 0
                runtime_player._bounty_won_cents = record.get("bounty_won_cents") or 0
                runtime_player._knockouts = record.get("knockouts") or 0
            runtime_player.is_eliminated = record["is_eliminated"]
            runtime_player.finish_position = record["finish_position"] or 0
            runtime_player.time_bank_seconds_remaining = record["time_bank_seconds_remaining"] or 0
            runtime_player._rebuy_count = record.get("rebuy_count") or 0
            runtime_player._user_id = record["user_id"]
            runtime_player._table_id = record["table_id"]
            runtime_player._table_number = record["table_number"] or 1
            runtime_player._global_seat = record["seat"]
            runtime_player._seat = record["seat_at_table"] if record["seat_at_table"] is not None else record["seat"]

            self._players_by_user_id[runtime_player._user_id] = runtime_player
            # Somebody registering late brings their own stack with them.
            if is_new and self._chip_total_known:
                self._expected_chip_total += record["chips"]

        # Only the first sync sets the baseline. This runs before every hand, so
        # taking the total from it each time would define away the very drift it
        # is here to catch.
        if not self._chip_total_known:
            self._expected_chip_total = self._chip_total()
            self._chip_total_known = True

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
                # Dealt in from here, so they stop reading as waiting.
                player._waiting_for_hand = False
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

        # Seats only reach a client through its own snapshot, so without this
        # everyone else keeps the previous roster — a rebuy or an arriving
        # player stays invisible at the table until a reload.
        for table in self._tables.values():
            await self._broadcast_to_table(
                table.table_number,
                "table_players",
                {"players": [self._player_payload(player) for player in sorted(table.players, key=lambda item: item._seat)]},
            )

    async def _run_table_hand(
        self, table: RuntimeTable, level: Dict[str, int],
    ) -> tuple[List[EnginePlayer], List[tuple[EnginePlayer, List[EnginePlayer]]]]:
        players = sorted(table.players, key=lambda item: item._seat)
        if len(players) < 2:
            return [], []

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
        return (
            [player for player in result.busted_players if player.chips == 0],
            [
                (victim, eliminators)
                for victim, eliminators in result.knockouts
                if victim.chips == 0
            ],
        )

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
            state["history"] = []
            state["result"] = {}
            state["level_index"] = self._level_index
        elif event_type == "blinds_posted":
            # Blinds sit in front of the players as street bets, not yet in the pot.
            state["sb_seat"] = payload["sb"]["seat"]
            state["bb_seat"] = payload["bb"]["seat"]
            state["bets"][payload["sb"]["seat"]] = payload["sb"]["amount"]
            state["bets"][payload["bb"]["seat"]] = payload["bb"]["amount"]
            state.setdefault("history", []).extend([
                {"street": "preflop", "seat": payload["sb"]["seat"], "action": "blind", "amount": payload["sb"]["amount"]},
                {"street": "preflop", "seat": payload["bb"]["seat"], "action": "blind", "amount": payload["bb"]["amount"]},
            ])
        elif event_type == "antes_posted":
            # Antes go straight to the pot.
            ante_payload = payload if isinstance(payload, list) else (payload or {}).get("entries", [])
            state["pot"] += sum(entry.get("amount", 0) for entry in ante_payload)
            state.setdefault("history", []).extend(
                {"street": "preflop", "seat": e.get("seat"), "action": "ante", "amount": e.get("amount", 0)}
                for e in ante_payload
            )
        elif event_type == "action_taken":
            state.setdefault("history", []).append({
                "street": state.get("street") or "preflop",
                "seat": payload.get("seat"),
                "action": payload.get("action"),
                "amount": payload.get("amount", 0),
            })
            seat = payload.get("seat")
            action = payload.get("action")
            amount = payload.get("amount", 0)
            if action == "call":
                state["bets"][seat] = state["bets"].get(seat, 0) + amount
            elif action in ("bet", "raise"):
                state["bets"][seat] = amount  # total street bet, not an increment
        elif event_type == "uncalled_bet_returned":
            seat = payload.get("seat")
            state["bets"][seat] = max(0, state["bets"].get(seat, 0) - payload.get("amount", 0))
        elif event_type == "street_dealt":
            state["community_cards"] = payload.get("cards", [])
            state["pot"] = payload.get("pot", state["pot"])
            state["street"] = payload.get("street", state["street"])
            state["bets"] = {}  # collected into the pot
        elif event_type == "showdown":
            state.setdefault("result", {})["showdown"] = payload if isinstance(payload, list) else payload
        elif event_type == "pot_awarded":
            state.setdefault("result", {})["awards"] = payload if isinstance(payload, list) else payload
        elif event_type == "hand_complete":
            # One write per hand rather than per action.
            if self.persist_hand is not None and state.get("history"):
                table_for_hand = self._tables.get(table_number)
                seat_to_tp = {
                    player._seat: player._tp_id
                    for player in (table_for_hand.players if table_for_hand else [])
                }
                await self.persist_hand({
                    "hand_number": state.get("hand_number", 0),
                    "level_index": state.get("level_index", self._level_index),
                    "dealer_seat": state.get("dealer_seat") or 0,
                    "community_cards": state.get("community_cards", []),
                    "pot_total": state.get("pot", 0) + sum(state.get("bets", {}).values()),
                    "result": state.get("result", {}),
                    "actions": [
                        {**item, "tp_id": seat_to_tp.get(item.get("seat"))}
                        for item in state.get("history", [])
                    ],
                })
            state["pot"] = 0
            state["bets"] = {}
            state["dealer_seat"] = None
            state["sb_seat"] = None
            state["bb_seat"] = None

        if event_type == "hand_strength_dealt":
            for player_data in payload.get("players", []):
                user_id = player_data.get("user_id")
                if user_id is None:
                    continue
                await self.notify_user(
                    user_id,
                    {"type": "hand_strength", "text": player_data["text"]},
                )
            return

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

    def _chip_total(self) -> int:
        return sum(player.chips for player in self._players_by_id.values())

    def _check_chip_total(self, when: str):
        """Shout if the tournament has more or fewer chips than it should.

        Chips are the whole ledger of a tournament: if they can drift, a final
        standing means nothing. Every legitimate change to the total — a rebuy
        adding a stack, an absent player being removed — records itself in
        `_expected_chip_total`, so anything else is a defect and says so here
        rather than quietly settling into someone's stack.
        """
        actual = self._chip_total()
        if actual == self._expected_chip_total:
            return
        drift = actual - self._expected_chip_total
        print(
            f"CHIP DRIFT in tournament {self.tournament_id} {when}: "
            f"expected {self._expected_chip_total}, found {actual} ({drift:+d})",
            flush=True,
        )
        # Report once per divergence, then track from the new total, so a single
        # defect does not bury the log in repeats of itself.
        self._expected_chip_total = actual

    def _active_player_count(self) -> int:
        return sum(1 for player in self._players_by_id.values() if not player.is_eliminated and player.chips > 0)

    def _current_level(self) -> Dict[str, int]:
        return self.levels[min(self._level_index, len(self.levels) - 1)]

    def _last_playable_level_index(self) -> Optional[int]:
        for index in range(len(self.levels) - 1, -1, -1):
            if not self.levels[index].get("is_break"):
                return index
        return None

    def _advance_level(self):
        # The final level has no duration: it runs until somebody wins. Raising
        # blinds past the structure would be inventing levels the host never set.
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
            # Stable identity. The username is what a player reads, but it can
            # change, and every server-side map is keyed by user id.
            "user_id": getattr(player, "_user_id", None),
            "seat": player._seat,
            "global_seat": player._global_seat,
            "table_number": player._table_number,
            "name": player.name,
            "avatar": getattr(player, "_avatar", "\U0001F0CF"),
            # The picture, when there is one. The emoji above stays the
            # fallback, so a client that cannot load it still has a seat marker.
            "avatar_url": getattr(player, "_avatar_url", None),
            "chips": player.chips,
            "time_bank_seconds_remaining": player.time_bank_seconds_remaining,
            "is_eliminated": player.is_eliminated,
            "is_folded": player.is_folded,
            "is_all_in": player.is_all_in,
            # What this seat is worth to whoever busts them, and what they have
            # already taken off other people. Always sent, so a client never has
            # to guess whether a blank means zero or means not loaded.
            "bounty_cents": getattr(player, "_bounty_cents", 0),
            "bounty_won_cents": getattr(player, "_bounty_won_cents", 0),
            "knockouts": getattr(player, "_knockouts", 0),
            # In the payload so it survives a game_state snapshot, unlike the
            # client-only is_disconnected flag.
            "is_sitting_out": player.is_sitting_out,
            # Back from a rebuy, at the table but not in the hand being played.
            "is_waiting": getattr(player, "_waiting_for_hand", False),
        }

    async def _announce_knockout(
        self,
        victim: EnginePlayer,
        eliminators: List[EnginePlayer],
    ) -> None:
        """Say who knocked whom out, and play their finishers if they have any.

        Separate from the bounty payment above because it is not about money: a
        tournament with no bounties still has knockouts worth marking.

        One knockout is one event, however many people did it. Sending it per
        eliminator meant a split pot fired twice in the same instant and the
        second finisher landed on top of the first, so only whoever happened to
        be last got theirs played — both share the knockout, so both play.

        Sent to the victim's table: everyone involved was in the same hand.
        """
        if not eliminators:
            return
        await self._broadcast_to_table(
            victim._table_number,
            "player_knockout",
            {
                "victim_seat": victim._seat,
                "victim_name": victim.name,
                "eliminators": [
                    {
                        "seat": eliminator._seat,
                        "name": eliminator.name,
                        "finisher_gif_id": getattr(eliminator, "_finisher_gif_id", None),
                    }
                    for eliminator in eliminators
                ],
            },
        )

    async def _pay_bounty(
        self,
        victim: EnginePlayer,
        eliminators: List[EnginePlayer],
        is_final: bool = False,
    ) -> None:
        """Move a busted player's bounty to whoever knocked them out.

        Nothing happens without an eliminator — a player removed for being
        offline, or one who quit, was not knocked out by anybody. Their bounty
        stays on their head and settlement hands it back, which is the only
        answer that keeps the pool adding up.
        """
        if not self.bounty.enabled or not eliminators:
            return
        on_head = getattr(victim, "_bounty_cents", 0)
        if on_head <= 0:
            return

        awards = split_knockout(self.bounty, on_head, len(eliminators), is_final_knockout=is_final)
        # Taken off the head first: a bounty must never be paid twice, and the
        # awards below add up to exactly this.
        victim._bounty_cents = 0

        for award in awards:
            eliminator = eliminators[award.eliminator_index]
            eliminator._bounty_won_cents = getattr(eliminator, "_bounty_won_cents", 0) + award.cash_cents
            eliminator._bounty_cents = getattr(eliminator, "_bounty_cents", 0) + award.to_head_cents
            eliminator._knockouts = getattr(eliminator, "_knockouts", 0) + 1
            await self._broadcast_to_table(
                eliminator._table_number,
                "bounty_won",
                {
                    "seat": eliminator._seat,
                    "name": eliminator.name,
                    "victim_name": victim.name,
                    "cash_cents": award.cash_cents,
                    "to_head_cents": award.to_head_cents,
                    "bounty_cents": eliminator._bounty_cents,
                    "bounty_won_cents": eliminator._bounty_won_cents,
                    "knockouts": eliminator._knockouts,
                    "split_ways": len(awards),
                },
            )

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
            # Their stack leaves the tournament with them.
            self._expected_chip_total -= player.chips
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
