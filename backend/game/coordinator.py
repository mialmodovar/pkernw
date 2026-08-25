"""Multi-table tournament coordinator."""

from __future__ import annotations

import asyncio
import random
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional

from tournaments import mystery
from tournaments.seating import pick_free_seat, seat_returning_players
from tournaments.bounties import BountyConfig, split_knockout

from .button import button_index, next_big_blind
from .engine.hand import HandEngine, cards_to_list
from .finishers import DEFAULT_SOUND, pick_finisher
from .levelclock import seconds_until_level_ends
from . import rabbithunt
from .sidebets import record_for, settle as settle_side_bets, updated_records
from sidegames.games import PLAYER_BET, clean_stake
from .engine.player import Player as EnginePlayer


TournamentBroadcastFn = Callable[[str, dict], Awaitable[None]]
TableBroadcastFn = Callable[[int, str, dict], Awaitable[None]]
TableRequestFn = Callable[[int, EnginePlayer, dict], Awaitable[tuple[str, int]]]
NotifyUserFn = Callable[[int, dict], Awaitable[None]]
LoadPlayersFn = Callable[[], Awaitable[List[dict]]]
PersistAssignmentsFn = Callable[[List[dict], List[int]], Awaitable[Dict[int, dict]]]
PersistPlayerStatesFn = Callable[[List[EnginePlayer]], Awaitable[None]]


# How long a seat plays on without its player before the table stops dealing it
# in. Most disconnections are a lift, a tunnel or a browser tab; the seat folds
# its way through those and nobody notices. These are the point at which it is
# no longer a blip, and a stack is quietly draining into an empty chair.
OFFLINE_SIT_OUT_SECONDS = 180
# Longer when the night is played for money. The stake is what makes a seat
# worth waiting for, and being sat out by the software while you find a signal
# is a harsher thing to come back to when it cost you real money.
OFFLINE_SIT_OUT_SECONDS_FOR_MONEY = 300


def offline_sit_out_seconds(tournament) -> int:
    """How long this tournament waits for a disconnected player."""
    has_money = (getattr(tournament, "buy_in_cents", 0) or 0) > 0
    return OFFLINE_SIT_OUT_SECONDS_FOR_MONEY if has_money else OFFLINE_SIT_OUT_SECONDS


@dataclass
class RuntimeTable:
    table_number: int
    table_id: Optional[int] = None
    max_seats: int = 9
    players: List[EnginePlayer] = field(default_factory=list)
    # Who paid the big blind last hand, by tournament-player id, and where they
    # stood in that hand's order — the fallback for when they bust paying it.
    # Never a seat: seats are handed out again every hand. The button is worked
    # out from this rather than kept, so that the blinds move one player a hand
    # whoever arrives in between. See game/button.py.
    blind_player: Optional[int] = None
    blind_index: int = 0
    hand_number: int = 0


class MultiTableTournamentCoordinator:
    # Which of a player's finishers plays for a given knockout. A seam rather
    # than a bare call to random, so a test can say which one it wants and the
    # engine stays as predictable as the rest of it.
    _choose_finisher = staticmethod(random.choice)

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
        # The coin economy, injected the way every other database is: the
        # coordinator runs in the event loop and owns no ORM. Both optional —
        # without them the side games are played for nothing, which is what the
        # coordinator's own tests want.
        take_side_bet_stake: Optional[Callable[[int, str, int], Awaitable[bool]]] = None,
        pay_side_bets: Optional[Callable[[list], Awaitable[dict]]] = None,
        # Takes the price of a look at the run-out out of a wallet, answering
        # the balance it left behind, or None when it could not be paid.
        take_rabbit_fee: Optional[Callable[[int, int], Awaitable[Optional[int]]]] = None,
        level_index: int = 0,
        hands_in_level: int = 0,
        # The highest hand number already on record for this tournament. Hands
        # are numbered per tournament in the database, but the count lives on a
        # table in memory, so a coordinator built for a tournament already in
        # progress has to be told where the numbering had got to.
        last_hand_number: int = 0,
        time_bank_seconds: int = 0,
        time_bank_refill_rule: str = "none",
        time_bank_refill_every_hands: Optional[int] = None,
        time_bank_refill_level: Optional[int] = None,
        rabbit_hunting_enabled: bool = False,
        auto_remove_offline_seconds: int = 0,
        offline_sit_out_seconds: int = 0,
        bounty: Optional[BountyConfig] = None,
        showdown_seconds: Optional[float] = None,
        allow_rebuys: bool = False,
        max_rebuys: Optional[int] = 0,
        rebuy_level: int = 0,
        # Through which level somebody may still enter. The engine only needs
        # it to answer "is the field final yet", which is what a mystery pool
        # has to know before it can be cut into envelopes.
        late_reg_level: int = 0,
        # Which fast format this is and what it pays — see consumers.fast_payload
        # — or None for a tournament, which is what most games are.
        fast: Optional[dict] = None,
        countdown_seconds: int = 30,
        # Mystery bounties: how many places pay (the money is one of the two
        # moments the envelopes can open), the pool as it stands, and whether it
        # has been opened. Read off the row on boot so a restart mid-tournament
        # picks up the same envelopes rather than cutting a second pool.
        paid_places: int = 0,
        mystery_release: str = "",
        mystery_envelopes: Optional[List[int]] = None,
        mystery_cut: Optional[List[int]] = None,
        mystery_opened: bool = False,
        mystery_winner_keeps: bool = False,
        all_in_or_fold: bool = False,
        # Cuts the pool into envelopes and writes them down, returning the list.
        # The count of entries is a database question, so the answer comes from
        # there rather than from anything the engine has been carrying.
        open_mystery: Optional[Callable[[int], Awaitable[List[int]]]] = None,
        # What is left after a draw. Written every time, because the row is the
        # only copy of the pool there is.
        persist_mystery: Optional[Callable[[List[int]], Awaitable[None]]] = None,
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
        self.offline_sit_out_seconds = max(0, offline_sit_out_seconds or 0)
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
        # None is unlimited, so it cannot be flattened to a number here.
        self.max_rebuys = None if max_rebuys is None else max(0, max_rebuys)
        self.rebuy_level = max(0, rebuy_level or 0)
        self.late_reg_level = max(0, late_reg_level or 0)
        self.fast = fast or None
        # How long the table holds before the first hand. It is loading time, not
        # a rule of the game, so a format that fires with everybody already
        # watching asks for less of it.
        self.countdown_seconds = max(0, countdown_seconds or 0)
        self.paid_places = max(0, paid_places or 0)
        self.mystery_release = mystery.clean_release(mystery_release)
        self._mystery_envelopes: List[int] = list(mystery_envelopes or [])
        # Every envelope the pool was cut into. The list above is what is left;
        # this one does not change, and the difference between them is what has
        # been drawn — which is the half of the board nobody could see.
        self._mystery_cut: List[int] = list(mystery_cut or mystery_envelopes or [])
        self._mystery_opened = bool(mystery_opened)
        # One envelope per head rather than one per knockout — see
        # mystery.envelope_count. The extra one is never drawn and goes to the
        # winner, because it was on their own head.
        self.mystery_winner_keeps = bool(mystery_winner_keeps)
        # Push or fold. The rule itself is one line in the hand engine; this is
        # only how it gets there.
        self.all_in_or_fold = bool(all_in_or_fold)
        self.open_mystery = open_mystery
        self.persist_mystery = persist_mystery
        self.broadcast_tournament = broadcast_tournament
        self.broadcast_table = broadcast_table
        self.request_action = request_action
        self.notify_user = notify_user
        self.load_players = load_players
        self.persist_assignments = persist_assignments
        self.persist_player_states = persist_player_states
        self.persist_progress = persist_progress
        self.persist_hand = persist_hand
        self.take_side_bet_stake = take_side_bet_stake
        self.pay_side_bets = pay_side_bets
        self.take_rabbit_fee = take_rabbit_fee

        self._players_by_id: Dict[int, EnginePlayer] = {}
        self._players_by_user_id: Dict[int, EnginePlayer] = {}
        self._tables: Dict[int, RuntimeTable] = {}
        self._table_states: Dict[int, dict] = {}
        # Resumed from the DB, so a restart picks up the blind level and the
        # hand count that play had actually reached.
        self._level_index = max(0, min(level_index, max(0, len(levels) - 1)))
        self._hands_in_level = max(0, hands_in_level)
        # Where a table starts counting when it has no predecessor to carry a
        # number over from — which is every table of a tournament that is being
        # picked up again rather than started.
        self._last_hand_number = max(0, last_hand_number)
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
        # Side bets: who the folded players fancy, per table, for the hand
        # being played — and how well everybody has been calling them. Both
        # live and die with the tournament, since nothing is at stake and a
        # record nobody can lose is not worth a table in the database.
        self._side_bets: Dict[int, dict] = {}
        # What was left in the deck at each table when its hand ended, and who
        # has paid to see it. The cards never leave this dictionary except to
        # the one player who bought them — see rabbithunt.py.
        self._rabbit: Dict[int, dict] = {}
        self._side_bet_records: Dict[int, dict] = {}
        self.is_paused = False
        self._paused_at: Optional[float] = None
        # Set once the winner is being decided, so a rebuy can't slip in after
        # the tournament has effectively ended.
        self._finishing = False
        # What the tournament should hold in total, adjusted whenever chips
        # legitimately enter or leave. See _check_chip_total.
        self._expected_chip_total = 0
        self._chip_total_known = False
        # Every stack as of the last check, so drift can name the seat it
        # appeared in rather than only the amount.
        self._stacks_at_last_check: Dict[int, int] = {}

    @property
    def current_blind_level_number(self) -> int:
        count = 0
        for idx in range(0, min(self._level_index, len(self.levels) - 1) + 1):
            if not self.levels[idx].get("is_break"):
                count += 1
        return count

    @property
    def current_level_index(self) -> int:
        """Where in the structure the tournament actually is, breaks included.

        Persisted after every hand, but the engine is a hand ahead of the row it
        writes, so anything asking from outside should ask here first.
        """
        return min(self._level_index, max(0, len(self.levels) - 1))

    def seconds_until_blind_level_ends(self, blind_level_number: int) -> Optional[int]:
        """How long until a given blind level is over, or None if it cannot be
        timed. Late registration is the caller: it closes at the end of a level,
        and "until level 4" is a worse answer than "eight minutes"."""
        if not self._level_start_time:
            elapsed = 0.0
        else:
            now = self._paused_at if self.is_paused and self._paused_at is not None else time.monotonic()
            elapsed = now - self._level_start_time
        return seconds_until_level_ends(self.levels, self._level_index, elapsed, blind_level_number)

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
                "fast": self.fast,
            },
        )

        # The countdown is there so everyone has time to load the table, not
        # because the table needs it. When every player says they are ready
        # there is nothing left to wait for, so the count stops early.
        self._countdown_open = True
        await self._broadcast_ready_state()
        for remaining in range(self.countdown_seconds, 0, -1):
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
            await self._sit_out_long_gone_players()
            await self._remove_timed_out_offline_players()
            await self._rebalance_tables()

            # Before the hand as well as after the busts below. Opening at the
            # close of registration is a fact about the clock, not about anybody
            # going out — and a table short enough to lose half its field in one
            # hand would otherwise have gone past the moment without noticing.
            await self._maybe_open_mystery()

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
            # A fresh deal, so nobody has shown anything yet. Reset here rather
            # than after the hands: the window opens per table, the moment that
            # table's hand ends (see _hand_event), and clearing this afterwards
            # would wipe the record of a player who had already shown — letting
            # them show again and hold the deal open a card at a time.
            self._shown_this_hand = set()
            results = await asyncio.gather(*(self._run_table_hand(table, level) for table in playable_tables))

            # Belt and braces for a hand that ends without the engine saying so.
            # The window is normally already open by now — see _hand_event.
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
                        "username": getattr(player, "_username", player.name),
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

            # Checked after the busts are counted, so "down to the money" is
            # judged on who is actually left rather than on who was left before
            # the hand that got us there.
            await self._maybe_open_mystery()

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
                        "username": getattr(player, "_username", player.name),
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
        if self.max_rebuys is not None and getattr(player, "_rebuy_count", 0) >= self.max_rebuys:
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
        """Show one or both of your cards to the table, once the hand is over.

        Only in the pause afterwards. Turning a card over while other players
        are still deciding tells them something they have not paid to know, and
        it was happening by accident: on a phone the gesture for looking at your
        own hand lands on the same cards, so a hand on its way to Fold was
        flashing an ace it never meant to. The pause is the moment for it, and it
        is the only moment offered — the same window the bar in the action panel
        is up for. Whoever is at the table can see who did it and when.

        Once per hand, so the pause cannot be held open indefinitely by a player
        revealing a card at a time.
        """
        if not self._show_open:
            return False
        if user_id in self._shown_this_hand:
            return False
        player = self._players_by_user_id.get(user_id)
        if player is None or not player.hole_cards:
            return False

        wanted = sorted({index for index in indices if index in (0, 1)})
        cards = [player.hole_cards[i] for i in wanted if i < len(player.hole_cards)]
        if not cards:
            return False

        self._shown_this_hand.add(user_id)
        # Everyone gets a full pause to look, including whoever shows last. The
        # window is open or this call already returned, so there is always a
        # pause to extend.
        self._show_deadline = max(
            self._show_deadline, time.monotonic() + self.showdown_seconds,
        )
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
    # Side bets — the folded players' game
    # ─────────────────────────────────────────────────────────────────────────

    async def _hand_event(self, table_number: int, event_type: str, payload) -> None:
        """Every event the hand engine emits, on its way out to the table.

        The engine knows nothing about side bets and should not: they are a
        thing the rail does while a hand happens to it. This is the one place
        that sees the whole hand go past, so it is where they open, lock and
        settle.
        """
        if event_type == "rabbit_hunt":
            # The one event that is not passed on as it arrives. The engine deals
            # the cards nobody paid for yet, and sending them to the table would
            # be giving away the thing that is for sale — so the table is told
            # only that there is something to see, and what it costs.
            self._rabbit[table_number] = rabbithunt.open_book(
                payload.get("cards"), payload.get("would_complete_board"),
            )
            await self._broadcast_to_table(
                table_number, "rabbit_hunt", rabbithunt.offer(self._rabbit[table_number]),
            )
            return

        await self._broadcast_to_table(table_number, event_type, payload)

        if event_type == "hand_complete":
            # The table has just been told the hand is over, so from this moment
            # a player may show. It has to open here rather than after the round:
            # a card picked during the hand is sent the instant that message
            # lands, and what came between — the other tables still playing,
            # eliminations, bounties, a database write — was long enough that
            # every one of those arrived before the window opened and was
            # refused. Nobody saw the card, and the player was never told why.
            self._show_open = True
            self._show_deadline = max(
                self._show_deadline, time.monotonic() + self.showdown_seconds,
            )

        if event_type in ("all_in_equity", "showdown"):
            # The cards are face up. Calling a hand you can already read is not
            # calling anything.
            book = self._side_bets.get(table_number)
            if book is not None:
                book["open"] = False
        elif event_type == "pot_awarded":
            await self._settle_side_bets(table_number, payload)

    def _open_side_bets(self, table) -> None:
        """A fresh book for a fresh hand, remembering who is in it.

        Who was dealt in is the half that cannot be read off a player later: a
        seat that never got cards and a seat that folded both look like "not in
        this hand", and only one of them may bet on it.
        """
        self._side_bets[table.table_number] = {
            "open": True,
            "dealt_in": {
                getattr(player, "_user_id", None) for player in table.players
            },
            "bets": {},
        }

    async def place_side_bet(
        self,
        user_id: int,
        on_user_id: int,
        stake=None,
        table_number: Optional[int] = None,
        name: str = "",
    ) -> bool:
        """Back somebody to win the hand you are not in.

        Once only, and only while the hand is still a question: a bet cannot be
        moved once placed, or it would be worth nothing to have called it early.

        The stake is taken now and the odds are fixed now — how many players
        were still in when you called it. Calling six-handed on the flop pays
        six; calling heads-up on the river pays two. That is what makes calling
        early worth anything, and it only works if the odds are stamped at the
        moment of the call rather than read again at the end.

        The bettor need not have a seat. Somebody on the rail — watching a
        table they were knocked out of, or one they never played — is the purest
        case of what this is for: no cards, no stake in the pot, an opinion
        about who takes it. They come with `table_number`, since there is no
        seat to read a table off, and with the `name` the table knows them by,
        since there is no runtime player holding it either.
        """
        pick = self._players_by_user_id.get(on_user_id)
        if pick is None or on_user_id == user_id:
            return False

        bettor = self._players_by_user_id.get(user_id)
        # Whose book this is: the table being watched, or the one the bettor is
        # sitting at. A watcher's own seat, if they have one somewhere, has
        # nothing to do with the hand they are calling.
        table = table_number if table_number is not None else getattr(bettor, "_table_number", None)
        if table is None or pick._table_number != table:
            return False
        table_number = table

        book = self._side_bets.get(table_number)
        if book is None or not book["open"] or user_id in book["bets"]:
            return False

        # You may only bet on a hand you are not in — folded, never dealt, or
        # not at this table at all.
        if user_id in book["dealt_in"] and not (bettor is not None and bettor.is_folded):
            return False
        # And only on somebody who is still in it.
        if on_user_id not in book["dealt_in"] or pick.is_folded:
            return False

        wager = clean_stake(PLAYER_BET, stake if stake is not None else PLAYER_BET.min_stake)
        if wager is None:
            return False

        odds = self._contender_count(table_number, book)
        if odds < 2:
            return False

        # Coins leave the wallet now. A stake that is only collected when you
        # lose is not a stake.
        if self.take_side_bet_stake is not None:
            if not await self.take_side_bet_stake(user_id, PLAYER_BET.id, wager):
                return False

        book["bets"][user_id] = {
            "on_user_id": on_user_id,
            "stake": wager,
            "odds": odds,
            # Only ever read for a bettor with no runtime player to ask.
            "name": name,
        }
        await self._broadcast_to_table(
            table_number,
            "side_bet_placed",
            self._side_bet_payload(user_id, book["bets"][user_id]),
        )
        return True

    # ─────────────────────────────────────────────────────────────────────────
    # Rabbit hunting — the cards nobody paid for yet
    # ─────────────────────────────────────────────────────────────────────────

    async def buy_rabbit_hunt(self, user_id: int, name: str = "") -> bool:
        """Sell one look at what would have come.

        The cards go to the buyer alone, and the fact of the purchase goes to
        everybody: watching somebody pay to find out is most of what rabbit
        hunting is at a live table, and it is the half the old free version
        could not give anybody.
        """
        player = self._players_by_user_id.get(user_id)
        if player is None:
            return False

        table_number = player._table_number
        book = self._rabbit.get(table_number)
        if not rabbithunt.may_buy(book, user_id):
            return False

        balance = None
        if self.take_rabbit_fee is not None:
            balance = await self.take_rabbit_fee(user_id, rabbithunt.PRICE)
            if balance is None:
                return False   # not enough coins, and nothing has been shown

        row = rabbithunt.record(book, user_id, name or player.name, player._seat)
        # The cards themselves, to the one wallet that paid for them.
        await self.notify_user(user_id, {
            "type": "rabbit_hunt_cards",
            "cards": list(book["cards"]),
            "would_complete_board": list(book["board"]),
            "balance": balance,
        })
        await self._broadcast_to_table(table_number, "rabbit_hunt_taken", {
            **row,
            "price": rabbithunt.PRICE,
            "buyers": rabbithunt.buyers(book),
        })
        return True

    def rabbit_hunt_at(self, table_number: int) -> dict:
        """The standing offer at a table, for a client that has just arrived."""
        return rabbithunt.offer(self._rabbit.get(table_number))

    def _contender_count(self, table_number: int, book: dict) -> int:
        """How many players are still contesting this pot."""
        return sum(
            1
            for user_id, player in self._players_by_user_id.items()
            if player._table_number == table_number
            and user_id in book["dealt_in"]
            and not player.is_folded
        )

    def _side_bet_payload(self, user_id: int, bet: dict) -> dict:
        bettor = self._players_by_user_id.get(user_id)
        pick = self._players_by_user_id.get(bet["on_user_id"])
        return {
            "user_id": user_id,
            # A watcher has no runtime player, so the name came in with the bet.
            "name": bettor.name if bettor else bet.get("name", ""),
            "seat": getattr(bettor, "_seat", None),
            "on_user_id": bet["on_user_id"],
            "on_name": pick.name if pick else "",
            "on_seat": getattr(pick, "_seat", None),
            "stake": bet["stake"],
            "odds": bet["odds"],
            # What it comes back as if the call is right, stake included.
            "returns": PLAYER_BET.payout(bet["stake"], bet["odds"]),
        }

    def side_bets_at(self, table_number: int) -> dict:
        """The open book at a table, for a client that has just arrived."""
        book = self._side_bets.get(table_number)
        if book is None:
            return {"open": False, "bets": []}
        return {
            "open": book["open"],
            "bets": [
                self._side_bet_payload(user_id, bet)
                for user_id, bet in book["bets"].items()
            ],
        }

    async def _settle_side_bets(self, table_number: int, awards) -> None:
        book = self._side_bets.get(table_number)
        if not book or not book["bets"]:
            return

        seats = {award["seat"] for award in awards if isinstance(award, dict)}
        winners = {
            user_id
            for user_id, player in self._players_by_user_id.items()
            if player._table_number == table_number and getattr(player, "_seat", None) in seats
        }

        picks = {user_id: bet["on_user_id"] for user_id, bet in book["bets"].items()}
        results = settle_side_bets(picks, winners)
        self._side_bet_records = updated_records(self._side_bet_records, results)

        settled = [
            {
                **self._side_bet_payload(one["user_id"], book["bets"][one["user_id"]]),
                "correct": one["correct"],
                "record": record_for(self._side_bet_records, one["user_id"]),
            }
            for one in results
        ]

        book["open"] = False
        book["bets"] = {}

        # Coins back to whoever called it right, before the table is told —
        # so the balance that arrives with the result is the balance they have.
        if self.pay_side_bets is not None:
            balances = await self.pay_side_bets([
                {
                    "user_id": one["user_id"],
                    "game_id": PLAYER_BET.id,
                    "returns": one["returns"] if one["correct"] else 0,
                }
                for one in settled
            ])
            for one in settled:
                one["balance"] = (balances or {}).get(one["user_id"])

        await self._broadcast_to_table(table_number, "side_bet_results", {"results": settled})

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
            table = self._any_table()
        if table is None:
            return None

        return self._table_snapshot(
            table,
            cards_to_list(player.hole_cards) if player.hole_cards else [],
        )

    async def snapshot_for_table(self, table_number: Optional[int]) -> Optional[dict]:
        """The same view of a table, for someone watching from the rail.

        No hole cards: a spectator only ever sees what the table shows.
        """
        table = self._tables.get(table_number) or self._any_table()
        if table is None:
            return None
        return self._table_snapshot(table, [])

    def _any_table(self):
        return next(iter(sorted(self._tables.values(), key=lambda item: item.table_number)), None)

    def _table_snapshot(self, table, hole_cards: List[str]) -> dict:
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
            "hole_cards": hole_cards,
            "current_table_number": table.table_number,
            "current_table_id": table.table_id,
            "table_count": len(self._tables),
            "table_summaries": self.table_summaries(),
            "is_paused": self.is_paused,
            # So a client that reloads during the countdown gets back the
            # readiness it can see, rather than an empty tally until the next
            # person clicks.
            "side_bets": self.side_bets_at(table.table_number),
            # Whatever is still on offer between hands, so a reload during the
            # gap comes back to the same button and the same list of who paid.
            "rabbit_hunt": self.rabbit_hunt_at(table.table_number),
            "ready_user_ids": sorted(self._ready_user_ids & self._seated_user_ids()),
            "ready_total": len(self._seated_user_ids()),
            # Included so a client joining or reconnecting mid-tournament gets
            # the blind level straight away, instead of waiting for the next
            # level_change broadcast.
            "level": self._level_payload(),
            # The format and its prize, for the same reason: a player who reloads
            # mid-game should still see what they are playing for, and the felt
            # should not change shape under them.
            "fast": self.fast,
            # And the mystery board. Until now this only ever arrived on the
            # broadcast that opened it, so a player who reloaded afterwards lost
            # the envelope count entirely — and, worse, lost the mark on every
            # head saying there is one to be drawn for it.
            "mystery": self._mystery_payload(),
        }

    def _mystery_payload(self) -> Optional[dict]:
        """What is left on the mystery board, for a client that just arrived.

        None outside a mystery tournament, and before the pool is cut it says so
        rather than being absent: "sealed" is a state the table shows, not the
        absence of one.
        """
        if not self.bounty.is_mystery:
            return None
        return {
            "opened": self._mystery_opened,
            "envelopes_left": len(self._mystery_envelopes),
            "pool_left_cents": sum(self._mystery_envelopes),
            "top_left_cents": max(self._mystery_envelopes, default=0),
            "release": self.mystery_release,
            # Both lists, so a table can show what is out there and what has
            # gone — and so a reload gets the same board rather than a count.
            # The amounts are not secret: they were read out to everybody the
            # moment the pool was cut.
            # Falling back to what is left when there is no record of the cut:
            # every pool opened before this was written has one list and not
            # two, and a board listing what is out there with nothing struck
            # off is the true answer from what is known.
            "cut": list(self._mystery_cut or self._mystery_envelopes),
            "left": list(self._mystery_envelopes),
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
        # Whatever busted them is still on the player: folded, or all in with an
        # empty stack. They are not dealt in again until the next rebalance, so
        # nothing else clears it, and the roster below would show a seat that
        # just rebought 10,000 chips as ALL IN.
        player.reset_for_hand()
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

        # This player only. A rebuy arrives from the request thread while a
        # hand is running here, so writing every player would snapshot stacks
        # mid-bet — chips already in the pot but not yet awarded — and the run
        # loop reads that back as truth if its own write lands first.
        await self.persist_player_states([player])
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
        # Drawn rather than the lowest free one, which is always the far end of
        # a table that has been packed up from zero — see tournaments/seating.py.
        free = pick_free_seat(taken, table.max_seats)
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
                runtime_player = EnginePlayer(
                    name=record.get("display_name") or record["username"],
                    chips=record["chips"],
                    is_human=True,
                )
                runtime_player._tp_id = record["id"]
                self._players_by_id[record["id"]] = runtime_player

            # What the felt reads. The username is kept beside it because that
            # is what every client keys on — stats, watch lists, "is this me" —
            # and a name a player can change is no key at all.
            runtime_player.name = record.get("display_name") or record["username"]
            runtime_player._username = record["username"]
            runtime_player._avatar = record.get("avatar") or "\U0001F0CF"
            runtime_player._avatar_border = record.get("avatar_border") or ""
            runtime_player._avatar_url = record.get("avatar_url")
            runtime_player._finisher_gif_id = record.get("finisher_gif_id")
            runtime_player._finishers = record.get("finishers") or []
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
        # Everybody keeps their place relative to everybody else, and whoever has
        # just bought back in goes in at a random point rather than on the end.
        #
        # This is where the reported bug actually lived: the sort above is the
        # order the seats are handed out in below, and a returning player was
        # given the highest free chair a moment earlier — so they sorted last,
        # every time, and sat in the same place every time. Nobody who has been
        # sitting there all night moves because somebody else came back.
        returning = [
            player for player in active_players
            if getattr(player, "_waiting_for_hand", False)
        ]
        if returning:
            active_players = seat_returning_players(active_players, returning)
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
                blind_player=None if previous is None else previous.blind_player,
                blind_index=0 if previous is None else previous.blind_index,
                # A brand-new table resumes the tournament's numbering rather
                # than restarting it: a process restart mid-tournament used to
                # deal "hand 1" again, so the finish screen — which reads the
                # last hand number — reported a night of nineteen hands as two.
                hand_number=self._last_hand_number if previous is None else previous.hand_number,
            )
            self._table_states.setdefault(table_number, {"community_cards": [], "pot": 0, "street": None, "hand_number": 0})

        # A table, not a seat. Everybody below a busted seat shifts up one when
        # the table closes ranks, and that was counting as a move: four players
        # at one table, one busts, and the other three are told they have been
        # moved to the table they are already sitting at. It also cost them
        # their camera — this event makes a client leave its table group and
        # forget its media presence, which is right when the table changes and
        # pure damage when it does not.
        moved_players = [
            player for player in active_players
            if old_assignments.get(player._tp_id, (None, None))[0] != player._table_number
        ]
        for player in moved_players:
            table = self._tables[player._table_number]
            await self.notify_user(
                player._user_id,
                {
                    "type": "table_assignment",
                    "table_number": table.table_number,
                    "table_id": table.table_id,
                    # Where they came from, or null for a player being seated
                    # for the first time. Only the first of those is a move
                    # worth putting a notice on the screen about.
                    "from_table": old_assignments.get(player._tp_id, (None, None))[0],
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

        # Worked out before the hand rather than after it: "the next player
        # along" is a question only this hand's seating can answer, and by the
        # time the hand is over the seating has already been handed out again.
        order = [player._tp_id for player in players]
        table.blind_player = next_big_blind(order, table.blind_player, table.blind_index)
        table.blind_index = order.index(table.blind_player)

        engine = HandEngine(
            players=players,
            dealer_pos=button_index(len(order), table.blind_index),
            small_blind=level["small_blind"],
            big_blind=level["big_blind"],
            ante=level["ante"],
            hand_number=table.hand_number + 1,
            broadcast=lambda event_type, payload: self._hand_event(table.table_number, event_type, payload),
            request_action=lambda player, context: self._request_action_tracked(table, player, context),
            rabbit_hunting_enabled=self.rabbit_hunting_enabled,
            all_in_or_fold=self.all_in_or_fold,
        )
        self._open_side_bets(table)
        # A fresh hand has nothing left over in the deck yet, and last hand's
        # offer must not be buyable once these cards are dealt.
        self._rabbit.pop(table.table_number, None)
        result = await engine.run()
        table.hand_number += 1
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
            # Taken before the antes, so this is what everyone brought to the
            # hand. Chips that appear between hands show up as a gap against
            # the previous hand's closing stacks.
            table_for_hand = self._tables.get(table_number)
            state["result"] = {
                "opening_stacks": [
                    {"seat": player._seat, "tp_id": player._tp_id, "chips": player.chips}
                    for player in sorted(
                        table_for_hand.players if table_for_hand else [],
                        key=lambda item: item._seat,
                    )
                ]
            }
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
                result = {
                    **state.get("result", {}),
                    "closing_stacks": [
                        {**row, "tp_id": seat_to_tp.get(row.get("seat"))}
                        for row in (payload or {}).get("stacks", [])
                    ],
                }
                await self.persist_hand({
                    "hand_number": state.get("hand_number", 0),
                    "level_index": state.get("level_index", self._level_index),
                    "dealer_seat": state.get("dealer_seat") or 0,
                    "community_cards": state.get("community_cards", []),
                    "pot_total": state.get("pot", 0) + sum(state.get("bets", {}).values()),
                    "result": result,
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
        previous = self._stacks_at_last_check
        self._stacks_at_last_check = {
            player._tp_id: player.chips for player in self._players_by_id.values()
        }
        actual = self._chip_total()
        if actual == self._expected_chip_total:
            return
        drift = actual - self._expected_chip_total
        rows = []
        for player in sorted(self._players_by_id.values(), key=lambda item: item._tp_id):
            name = getattr(player, "_username", player.name)
            was = previous.get(player._tp_id)
            moved = "" if was is None else f" ({player.chips - was:+d})"
            rows.append(f"{name}={player.chips}{moved}")
        print(
            f"CHIP DRIFT in tournament {self.tournament_id} {when}: "
            f"expected {self._expected_chip_total}, found {actual} ({drift:+d}) "
            f"stacks: {', '.join(rows)}",
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
            "username": getattr(player, "_username", player.name),
            "avatar": getattr(player, "_avatar", "\U0001F0CF"),
            "avatar_border": getattr(player, "_avatar_border", ""),
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
                        **self._finisher_for(eliminator),
                    }
                    for eliminator in eliminators
                ],
            },
        )

    def _finisher_for(self, player) -> dict:
        """Which of this player's finishers plays for this knockout.

        Chosen here rather than on each client: everybody at the table has to
        watch the same clip, and eight browsers rolling their own dice would
        put eight different GIFs over the same knockout.
        """
        finishers = getattr(player, "_finishers", None) or []
        chosen = pick_finisher(finishers, self._choose_finisher)
        if chosen is None:
            # Nothing in the list, but an older profile may still carry the one
            # id that came before it.
            return {
                "finisher_gif_id": getattr(player, "_finisher_gif_id", None),
                "finisher_sound": DEFAULT_SOUND,
            }
        return {"finisher_gif_id": chosen["gif_id"], "finisher_sound": chosen["sound"]}

    async def _maybe_open_mystery(self) -> None:
        """Open the envelopes, if this is the moment.

        Once and once only: the pool is cut on the strength of how many players
        are left, and cutting it twice would invent a second pool out of the
        same buy-ins.

        Note that both release rules require registration to be closed. A pool
        that can still grow is a pool that cannot be cut up — a late entry after
        the envelopes were counted is one more knockout than there are envelopes
        to pay it with. In practice the money arrives long after late
        registration does, so this only ever bites on a format short enough for
        the two to collide.
        """
        if not self.bounty.is_mystery or self._mystery_opened or self.open_mystery is None:
            return

        remaining = self._active_player_count()
        closed = mystery.registration_closed(
            self.current_blind_level_number,
            self.late_reg_level,
            self.rebuy_level,
            self.allow_rebuys,
        )
        if not closed:
            return
        if not mystery.should_release(
            self.mystery_release,
            remaining_players=remaining,
            paid_places=self.paid_places,
            registration_is_closed=closed,
        ):
            return

        # One envelope per knockout still to come — everybody left but the
        # winner is going to be busted by somebody — or one per head, where the
        # winner keeps their own.
        draws = mystery.envelope_count(remaining, self.mystery_winner_keeps)
        if draws <= 0:
            return

        envelopes = await self.open_mystery(draws)
        self._mystery_envelopes = list(envelopes or [])
        # What there ever was, so the board can strike off what goes.
        self._mystery_cut = list(self._mystery_envelopes)
        self._mystery_opened = True

        await self.broadcast_tournament(
            "mystery_opened",
            {
                "envelopes": list(self._mystery_envelopes),
                "pool_cents": sum(self._mystery_envelopes),
                "top_cents": max(self._mystery_envelopes, default=0),
                "players_left": remaining,
                "reason": self.mystery_release,
            },
        )

    async def _draw_mystery(self, victim, eliminators) -> None:
        """One knockout, one envelope, split between whoever did it.

        Nothing is paid before the envelopes open — that is the format, and it
        is why a mystery bounty is worth chasing at all. The knockout still
        counts: it happened, and the count is what the table reads.
        """
        for eliminator in eliminators:
            eliminator._knockouts = getattr(eliminator, "_knockouts", 0) + 1

        if not self._mystery_opened:
            await self._broadcast_to_table(
                victim._table_number,
                "mystery_sealed",
                {
                    "victim_name": victim.name,
                    "eliminators": [one.name for one in eliminators],
                    "knockouts": getattr(eliminators[0], "_knockouts", 0),
                },
            )
            return

        if not self._mystery_envelopes:
            # More knockouts than envelopes should be impossible — see the note
            # in _maybe_open_mystery — but paying out of an empty pool would be
            # inventing money, so it does not.
            print(f"[MYSTERY] tournament {self.tournament_id}: knockout with no envelope left")
            return

        index = mystery.draw_index(self._mystery_envelopes, random)
        amount, remaining = mystery.take(self._mystery_envelopes, index)
        self._mystery_envelopes = remaining
        if self.persist_mystery is not None:
            await self.persist_mystery(list(remaining))

        # Split like any other bounty, so a pot busted by two people pays them
        # both and the cents still add up.
        base, extra = divmod(amount, len(eliminators))
        top = max(remaining, default=0)
        for index, eliminator in enumerate(eliminators):
            share = base + (1 if index < extra else 0)
            eliminator._bounty_won_cents = getattr(eliminator, "_bounty_won_cents", 0) + share
            await self._broadcast_to_table(
                eliminator._table_number,
                "bounty_won",
                {
                    "seat": eliminator._seat,
                    "name": eliminator.name,
                    "victim_name": victim.name,
                    "cash_cents": share,
                    "to_head_cents": 0,
                    "bounty_cents": getattr(eliminator, "_bounty_cents", 0),
                    "bounty_won_cents": eliminator._bounty_won_cents,
                    "knockouts": getattr(eliminator, "_knockouts", 0),
                    "split_ways": len(eliminators),
                    # What the table needs to make something of it: that this
                    # was drawn rather than known, what the whole envelope held,
                    # and how it stands against what is left in the pool.
                    "mystery": {
                        "envelope_cents": amount,
                        "envelopes_left": len(remaining),
                        "pool_left_cents": sum(remaining),
                        "top_left_cents": top,
                        "is_top_prize": amount >= top and amount > 0,
                    },
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
        if not eliminators:
            return
        if self.bounty.is_mystery:
            await self._draw_mystery(victim, eliminators)
            return
        if not self.bounty.enabled:
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

    async def _sit_out_long_gone_players(self):
        """Stop dealing somebody in once they have been gone long enough.

        A dropped connection is not the same as leaving: the seat stays, and for
        the first few minutes it plays on — the blinds go in and the turn folds
        — because most disconnections last seconds and nobody wants to come back
        to a seat that quit on their behalf. Past that, the same behaviour is
        just a stack bleeding away to a browser that crashed, so the seat sits
        out. It costs nothing to undo: the player sits back in when they return.

        The wait is longer where there is money on the table (see
        offline_sit_out_seconds below) — the more a hand is worth, the more
        patience it is worth showing somebody whose train went into a tunnel.
        """
        if self.offline_sit_out_seconds <= 0 or not self._offline_since:
            return

        now = time.monotonic()
        for user_id, disconnected_at in list(self._offline_since.items()):
            if now - disconnected_at < self.offline_sit_out_seconds:
                continue
            player = self._players_by_user_id.get(user_id)
            if player is None or player.is_eliminated or player.is_sitting_out:
                continue
            # Through set_sitting_out rather than the flag, so the table is told
            # and every client shows the seat as sitting out.
            await self.set_sitting_out(user_id, True)

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
                    "username": getattr(player, "_username", player.name),
                    "finish_position": player.finish_position,
                    "reason": "offline_timeout",
                },
            )

        await self.persist_player_states(list(self._players_by_id.values()))
