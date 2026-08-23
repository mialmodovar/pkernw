import asyncio
import json
import random
import time
from unittest.mock import patch

from asgiref.sync import async_to_sync, sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TestCase, TransactionTestCase
from django.urls import reverse
from rest_framework.test import APITestCase

from tournaments.models import Tournament, TournamentPlayer, TournamentTable

from .coordinator import MultiTableTournamentCoordinator, offline_sit_out_seconds
from .consumers import (
    CHAT_MESSAGE_BUDGET, MEDIA_MESSAGE_BUDGET, TournamentConsumer, _action_queues,
    _game_tasks, _media_presence, _player_channels, _request_action, _tournament_runners,
    fast_payload,
)

User = get_user_model()
from .engine.card import Card, Rank, Suit
from .levelclock import seconds_until_level_ends
from .besthand import best_of
from .sidebets import record_for, settle, updated_records
from .engine.hand import HandEngine
from .engine.player import Player


class CoordinatorHarness:
    """A coordinator with the world stubbed out around it.

    Every collaborator is a list this test can read afterwards: what went out
    to the tables, what was written back, who was told what.
    """

    def _record(
        self,
        index,
        *,
        table_number=1,
        seat_at_table=None,
        chips=1000,
        is_eliminated=False,
        time_bank_seconds_remaining=0,
    ):
        return {
            "id": index + 1,
            "user_id": 100 + index,
            "username": f"player{index + 1}",
            "table_id": 200 + table_number,
            "table_number": table_number,
            "seat": index,
            "seat_at_table": index if seat_at_table is None else seat_at_table,
            "chips": chips,
            "is_eliminated": is_eliminated,
            "finish_position": None,
            "time_bank_seconds_remaining": time_bank_seconds_remaining,
        }

    def _build_coordinator(self, records, *, players_per_table=3, last_hand_number=0):
        self.records = [dict(record) for record in records]
        self.assignments = []
        self.notifications = []
        self.tournament_events = []
        self.table_events = []

        async def broadcast_tournament(event_type, payload):
            self.tournament_events.append((event_type, payload))

        async def broadcast_table(table_number, event_type, payload):
            self.table_events.append((table_number, event_type, payload))

        async def request_action(table_number, player, context):
            return "check", 0

        async def notify_user(user_id, payload):
            self.notifications.append((user_id, payload))

        async def load_players():
            return [dict(record) for record in self.records]

        async def persist_assignments(layout, active_table_numbers):
            self.assignments.append(
                {
                    "layout": [dict(assignment) for assignment in layout],
                    "active_table_numbers": list(active_table_numbers),
                }
            )
            records_by_id = {record["id"]: record for record in self.records}
            for assignment in layout:
                record = records_by_id[assignment["tp_id"]]
                record["table_number"] = assignment["table_number"]
                record["table_id"] = 200 + assignment["table_number"]
                record["seat"] = assignment["seat"]
                record["seat_at_table"] = assignment["seat_at_table"]

            return {
                table_number: {"id": 200 + table_number, "max_seats": players_per_table}
                for table_number in active_table_numbers
            }

        async def persist_player_states(players):
            return None

        # A wallet per player, in memory. The real one is a database behind two
        # callbacks; what the coordinator cares about is that a stake can be
        # refused and a payout lands.
        self.coins = {}

        async def take_side_bet_stake(user_id, game_id, stake):
            purse = self.coins.setdefault(user_id, 1000)
            if purse < stake:
                return False
            self.coins[user_id] = purse - stake
            return True

        async def pay_side_bets(entries):
            for entry in entries:
                self.coins[entry["user_id"]] = self.coins.get(entry["user_id"], 0) + entry["returns"]
            return dict(self.coins)

        return MultiTableTournamentCoordinator(
            tournament_id=1,
            players_per_table=players_per_table,
            levels=[{"small_blind": 10, "big_blind": 20, "ante": 0, "duration_hands": 8}],
            broadcast_tournament=broadcast_tournament,
            broadcast_table=broadcast_table,
            request_action=request_action,
            notify_user=notify_user,
            load_players=load_players,
            persist_assignments=persist_assignments,
            persist_player_states=persist_player_states,
            take_side_bet_stake=take_side_bet_stake,
            pay_side_bets=pay_side_bets,
            last_hand_number=last_hand_number,
        )

    def _sync_and_rebalance(self, coordinator):
        async_to_sync(coordinator._sync_players_from_db)()
        async_to_sync(coordinator._rebalance_tables)()


class MultiTableTournamentCoordinatorTests(CoordinatorHarness, TestCase):
    def test_boot_layout_creates_two_runtime_tables(self):
        coordinator = self._build_coordinator(
            [self._record(index, table_number=1, seat_at_table=index) for index in range(4)],
            players_per_table=3,
        )

        self._sync_and_rebalance(coordinator)

        self.assertEqual([table["table_number"] for table in coordinator.table_summaries()], [1, 2])
        self.assertEqual([table["player_count"] for table in coordinator.table_summaries()], [2, 2])
        self.assertEqual(self.assignments[-1]["active_table_numbers"], [1, 2])

    def test_tables_start_numbering_hands_where_the_record_left_off(self):
        """A tournament picked up again carries on counting.

        The hand count lives on an in-memory table, so a restart mid-tournament
        used to deal hand 1 for the second time — leaving two hands with the
        same number and a finish screen, which reads the last number rather than
        counting rows, calling a nineteen-hand game a two-hand one.
        """
        coordinator = self._build_coordinator(
            [self._record(index, table_number=1, seat_at_table=index) for index in range(3)],
            last_hand_number=17,
        )

        self._sync_and_rebalance(coordinator)

        self.assertEqual(coordinator._tables[1].hand_number, 17)

    def test_a_fresh_tournament_still_starts_at_hand_zero(self):
        coordinator = self._build_coordinator(
            [self._record(index, table_number=1, seat_at_table=index) for index in range(3)],
        )

        self._sync_and_rebalance(coordinator)

        self.assertEqual(coordinator._tables[1].hand_number, 0)

    def test_rebalanced_tables_keep_their_own_count(self):
        """A table that already exists carries its own number, not the seed."""
        coordinator = self._build_coordinator(
            [self._record(index, table_number=1, seat_at_table=index) for index in range(4)],
            players_per_table=3,
            last_hand_number=17,
        )
        self._sync_and_rebalance(coordinator)
        coordinator._tables[1].hand_number = 20

        self._sync_and_rebalance(coordinator)

        self.assertEqual(coordinator._tables[1].hand_number, 20)

    def test_spectator_snapshot_shows_a_table_without_its_hole_cards(self):
        coordinator = self._build_coordinator(
            [self._record(index, table_number=1, seat_at_table=index) for index in range(4)],
            players_per_table=3,
        )
        self._sync_and_rebalance(coordinator)
        for player in coordinator._players_by_user_id.values():
            player.hole_cards = [Card(Rank.ACE, Suit.SPADES), Card(Rank.KING, Suit.HEARTS)]

        snapshot = async_to_sync(coordinator.snapshot_for_table)(2)

        self.assertEqual(snapshot["current_table_number"], 2)
        self.assertEqual(snapshot["hole_cards"], [])
        # A table that no longer exists still gets a live one to watch.
        fallback = async_to_sync(coordinator.snapshot_for_table)(99)
        self.assertIn(fallback["current_table_number"], (1, 2))

    def test_elimination_rebalance_moves_player_between_tables(self):
        records = [
            *[self._record(index, table_number=1, seat_at_table=index) for index in range(3)],
            *[self._record(index, table_number=2, seat_at_table=index - 3) for index in range(3, 6)],
        ]
        coordinator = self._build_coordinator(records, players_per_table=3)
        self._sync_and_rebalance(coordinator)
        self.notifications.clear()

        self.records[1]["chips"] = 0
        self.records[1]["is_eliminated"] = True
        self._sync_and_rebalance(coordinator)

        self.assertEqual([table["player_count"] for table in coordinator.table_summaries()], [3, 2])
        moved_user_ids = [user_id for user_id, _payload in self.notifications]
        self.assertIn(103, moved_user_ids)
        moved_payload = next(payload for user_id, payload in self.notifications if user_id == 103)
        self.assertEqual(moved_payload["type"], "table_assignment")
        self.assertEqual(moved_payload["table_number"], 1)
        self.assertEqual(moved_payload["seat"], 2)
        # Where they came from, so the client can tell a move from a seating.
        self.assertEqual(moved_payload["from_table"], 2)

    def test_closing_ranks_after_a_knockout_is_not_a_move(self):
        """Four at one table, one busts, and the survivors shift up a seat.

        Nobody went anywhere, but every seat index below the bust changed — and
        that was being sent as a table assignment. On screen it was a "you were
        moved to table 1" notice at the table you were already sitting at, and
        underneath it made the client leave its own table group and forget its
        camera.
        """
        records = [self._record(index, table_number=1, seat_at_table=index) for index in range(4)]
        coordinator = self._build_coordinator(records, players_per_table=8)
        self._sync_and_rebalance(coordinator)
        self.notifications.clear()

        # The second seat busts; the two below it close up.
        self.records[1]["chips"] = 0
        self.records[1]["is_eliminated"] = True
        self._sync_and_rebalance(coordinator)

        self.assertEqual([table["player_count"] for table in coordinator.table_summaries()], [3])
        self.assertEqual(self.notifications, [])
        # The seats really did shift — this is not a test of nothing happening.
        seats = {player._user_id: player._seat for player in coordinator._players_by_id.values()
                 if not player.is_eliminated}
        self.assertEqual(sorted(seats.values()), [0, 1, 2])

    def test_final_table_merge_deactivates_extra_tables(self):
        records = [
            *[self._record(index, table_number=1, seat_at_table=index) for index in range(2)],
            *[self._record(index, table_number=2, seat_at_table=index - 2) for index in range(2, 4)],
        ]
        coordinator = self._build_coordinator(records, players_per_table=3)
        self._sync_and_rebalance(coordinator)
        self.notifications.clear()

        self.records[0]["chips"] = 0
        self.records[0]["is_eliminated"] = True
        self._sync_and_rebalance(coordinator)

        self.assertEqual(coordinator.table_summaries(), [{"table_number": 1, "table_id": 201, "player_count": 3, "max_seats": 3}])
        self.assertEqual(self.assignments[-1]["active_table_numbers"], [1])
        self.assertEqual({payload["table_number"] for _user_id, payload in self.notifications}, {1})

    def test_time_bank_refills_every_configured_hands(self):
        coordinator = self._build_coordinator(
            [self._record(index, time_bank_seconds_remaining=0) for index in range(3)],
            players_per_table=3,
        )
        coordinator.time_bank_seconds = 30
        coordinator.time_bank_refill_rule = "hands"
        coordinator.time_bank_refill_every_hands = 2
        self._sync_and_rebalance(coordinator)

        coordinator._hands_played = 1
        coordinator._refill_time_banks_after_hand()
        self.assertTrue(all(player.time_bank_seconds_remaining == 0 for player in coordinator._players_by_id.values()))

        coordinator._hands_played = 2
        coordinator._refill_time_banks_after_hand()
        self.assertTrue(all(player.time_bank_seconds_remaining == 30 for player in coordinator._players_by_id.values()))

    def test_time_bank_refills_at_configured_blind_level(self):
        coordinator = self._build_coordinator(
            [self._record(index, time_bank_seconds_remaining=0) for index in range(3)],
            players_per_table=3,
        )
        coordinator.levels = [
            {"small_blind": 10, "big_blind": 20, "ante": 0, "duration_hands": 1},
            {"small_blind": 20, "big_blind": 40, "ante": 0, "duration_hands": 1},
        ]
        coordinator.time_bank_seconds = 45
        coordinator.time_bank_refill_rule = "blind_level"
        coordinator.time_bank_refill_level = 2
        self._sync_and_rebalance(coordinator)

        coordinator._set_next_level()

        self.assertTrue(all(player.time_bank_seconds_remaining == 45 for player in coordinator._players_by_id.values()))

    def test_pause_resume_and_skip_level_broadcast_admin_events(self):
        coordinator = self._build_coordinator(
            [self._record(index) for index in range(3)],
            players_per_table=3,
        )
        coordinator.levels = [
            {"small_blind": 10, "big_blind": 20, "ante": 0, "duration_hands": 1},
            {"small_blind": 20, "big_blind": 40, "ante": 0, "duration_hands": 1},
        ]
        self._sync_and_rebalance(coordinator)

        pause_payload = async_to_sync(coordinator.pause)()
        resume_payload = async_to_sync(coordinator.resume)()
        skip_payload = async_to_sync(coordinator.skip_level)()

        self.assertEqual(pause_payload["status"], "paused")
        self.assertFalse(coordinator.is_paused)
        self.assertEqual(resume_payload["status"], "running")
        self.assertTrue(skip_payload["skipped"])
        self.assertEqual(skip_payload["blind_level_number"], 2)
        self.assertIn("tournament_paused", [event_type for event_type, _payload in self.tournament_events])
        self.assertIn("tournament_resumed", [event_type for event_type, _payload in self.tournament_events])
        self.assertIn("level_change", [event_type for event_type, _payload in self.tournament_events])

    def test_pause_resume_preserves_timed_level_elapsed_time(self):
        coordinator = self._build_coordinator(
            [self._record(index) for index in range(3)],
            players_per_table=3,
        )
        coordinator.levels = [{"small_blind": 10, "big_blind": 20, "ante": 0, "duration_minutes": 2}]
        self._sync_and_rebalance(coordinator)
        coordinator._level_start_time = time.monotonic() - 30

        async_to_sync(coordinator.pause)()
        async_to_sync(coordinator.resume)()

        remaining_seconds = coordinator._level_payload()["remaining_seconds"]
        self.assertLessEqual(remaining_seconds, 90)
        self.assertGreater(remaining_seconds, 85)

    def test_offline_timeout_eliminates_player_at_boundary(self):
        coordinator = self._build_coordinator(
            [self._record(index) for index in range(3)],
            players_per_table=3,
        )
        coordinator.auto_remove_offline_seconds = 60
        self._sync_and_rebalance(coordinator)
        coordinator._offline_since[100] = time.monotonic() - 61

        async_to_sync(coordinator._remove_timed_out_offline_players)()

        player = coordinator._players_by_user_id[100]
        self.assertTrue(player.is_eliminated)
        self.assertEqual(player.chips, 0)
        self.assertEqual(player.finish_position, 3)

    def test_a_seat_sits_out_once_its_player_has_been_gone_too_long(self):
        coordinator = self._build_coordinator(
            [self._record(index) for index in range(3)],
            players_per_table=3,
        )
        coordinator.offline_sit_out_seconds = 180
        self._sync_and_rebalance(coordinator)
        coordinator._offline_since[100] = time.monotonic() - 181

        async_to_sync(coordinator._sit_out_long_gone_players)()

        player = coordinator._players_by_user_id[100]
        self.assertTrue(player.is_sitting_out)
        # Sitting out, not out: the seat and the stack are still theirs to
        # come back to.
        self.assertFalse(player.is_eliminated)
        self.assertGreater(player.chips, 0)

    def test_a_short_disconnection_plays_on(self):
        coordinator = self._build_coordinator(
            [self._record(index) for index in range(3)],
            players_per_table=3,
        )
        coordinator.offline_sit_out_seconds = 180
        self._sync_and_rebalance(coordinator)
        coordinator._offline_since[100] = time.monotonic() - 179

        async_to_sync(coordinator._sit_out_long_gone_players)()

        self.assertFalse(coordinator._players_by_user_id[100].is_sitting_out)

    def test_a_night_played_for_money_waits_longer(self):
        from tournaments.models import Tournament

        free = Tournament(buy_in_cents=0)
        stakes = Tournament(buy_in_cents=1000)

        self.assertEqual(offline_sit_out_seconds(free), 180)
        self.assertEqual(offline_sit_out_seconds(stakes), 300)

    def test_table_broadcast_wraps_list_payloads_with_table_metadata(self):
        coordinator = self._build_coordinator(
            [self._record(index) for index in range(3)],
            players_per_table=3,
        )
        self._sync_and_rebalance(coordinator)

        async_to_sync(coordinator._broadcast_to_table)(1, "showdown", [{"seat": 0, "cards": ["AS", "KS"]}])

        self.assertEqual(
            self.table_events[-1],
            (
                1,
                "showdown",
                {
                    "data": [{"seat": 0, "cards": ["AS", "KS"]}],
                    "table_number": 1,
                    "table_id": 201,
                },
            ),
        )


    def test_rebalance_broadcasts_table_rosters(self):
        coordinator = self._build_coordinator(
            [self._record(index, table_number=1, seat_at_table=index) for index in range(3)],
            players_per_table=3,
        )
        self.records[1]["chips"] = 0
        self.records[1]["is_eliminated"] = True
        self._sync_and_rebalance(coordinator)
        self.table_events.clear()

        # The rebuy the runner would have applied before the next hand.
        self.records[1]["chips"] = 1000
        self.records[1]["is_eliminated"] = False
        self._sync_and_rebalance(coordinator)

        roster = next(
            payload for _table_number, event_type, payload in self.table_events
            if event_type == "table_players"
        )
        self.assertEqual(
            sorted(player["name"] for player in roster["players"]),
            ["player1", "player2", "player3"],
        )


class HandEngineUncalledBetTests(TestCase):
    def _run_hand(self, chips, actions):
        events = []
        self.contexts = []
        players = [Player("button", chips[0]), Player("big blind", chips[1])]
        for seat, player in enumerate(players):
            player._seat = seat

        async def broadcast(event_type, payload):
            events.append((event_type, payload))

        async def request_action(player, context):
            self.contexts.append(context)
            return actions.pop(0) if actions else ("fold", 0)

        engine = HandEngine(
            players=players,
            dealer_pos=0,
            small_blind=5,
            big_blind=10,
            ante=0,
            hand_number=1,
            broadcast=broadcast,
            request_action=request_action,
        )
        async_to_sync(engine.run)()
        return players, events

    def test_all_in_over_a_shorter_stack_returns_the_uncovered_chips(self):
        players, events = self._run_hand([1000, 300], [("raise", 1000), ("call", 0)])

        returned = next(payload for event_type, payload in events if event_type == "uncalled_bet_returned")
        self.assertEqual(returned["seat"], 0)
        self.assertEqual(returned["amount"], 700)
        self.assertEqual(returned["pot"], 600)

        flop = next(payload for event_type, payload in events if event_type == "street_dealt")
        self.assertEqual(flop["pot"], 600)

        awarded = sum(
            award["amount"]
            for event_type, payload in events if event_type == "pot_awarded"
            for award in payload
        )
        self.assertEqual(awarded, 600)
        self.assertEqual(sum(player.chips for player in players), 1300)

    def test_a_call_that_covers_the_bet_returns_nothing(self):
        _players, events = self._run_hand([1000, 1000], [("raise", 200), ("call", 0)] + [("check", 0)] * 6)

        self.assertNotIn("uncalled_bet_returned", [event_type for event_type, _payload in events])

    def test_short_stack_is_only_asked_for_the_chips_it_has(self):
        self._run_hand([10_325, 9_675], [("raise", 10_325), ("call", 0)])

        facing_the_shove = self.contexts[1]
        self.assertEqual(facing_the_shove["to_call"], 9_665)  # the whole stack, not the 10,315 shoved
        self.assertEqual(facing_the_shove["pot"], 9_685)      # 10,335 on the table, 650 of it uncallable
        self.assertNotIn("raise", facing_the_shove["valid_actions"])

    def test_raise_offer_collapses_to_all_in_when_a_full_raise_is_out_of_reach(self):
        contexts = []
        players = [Player("shover", 9_712), Player("small blind", 9_950), Player("big blind", 10_288)]
        for seat, player in enumerate(players):
            player._seat = seat

        actions = [("raise", 9_712), ("call", 0), ("call", 0)]

        async def broadcast(event_type, payload):
            return None

        async def request_action(player, context):
            contexts.append(context)
            return actions.pop(0) if actions else ("check", 0)

        engine = HandEngine(
            players=players,
            dealer_pos=0,
            small_blind=25,
            big_blind=50,
            ante=0,
            hand_number=1,
            broadcast=broadcast,
            request_action=request_action,
        )
        async_to_sync(engine.run)()

        facing_the_shove = contexts[1]
        self.assertIn("raise", facing_the_shove["valid_actions"])
        # A full raise would be 19,374 — more than the stack can ever put in.
        self.assertEqual(facing_the_shove["min_raise"], 9_950)
        self.assertEqual(facing_the_shove["max_raise"], 9_950)


class HandEngineRabbitHuntTests(TestCase):
    def test_rabbit_hunt_broadcasts_unused_board_cards_after_early_finish(self):
        events = []
        players = [Player("button", 100), Player("big blind", 100)]
        for seat, player in enumerate(players):
            player._seat = seat

        async def broadcast(event_type, payload):
            events.append((event_type, payload))

        async def request_action(player, context):
            return "fold", 0

        engine = HandEngine(
            players=players,
            dealer_pos=0,
            small_blind=5,
            big_blind=10,
            ante=0,
            hand_number=1,
            broadcast=broadcast,
            request_action=request_action,
            rabbit_hunting_enabled=True,
        )

        async_to_sync(engine.run)()

        rabbit_payload = next(payload for event_type, payload in events if event_type == "rabbit_hunt")
        self.assertEqual(len(rabbit_payload["cards"]), 5)
        self.assertEqual(len(rabbit_payload["would_complete_board"]), 5)


class TournamentActionRequestTests(TestCase):
    def test_paused_tournament_does_not_consume_action_timeout(self):
        async def run_scenario():
            tournament_id = 999
            user_id = 123
            key = (tournament_id, user_id)
            _action_queues[key] = asyncio.Queue()

            player = Player("paused player", 1000)
            player._user_id = user_id
            player.time_bank_seconds_remaining = 5
            paused = True

            try:
                request_task = asyncio.create_task(
                    _request_action(
                        tournament_id,
                        1,
                        player,
                        {"valid_actions": ["fold"], "action_timer_seconds": 1},
                        is_paused=lambda: paused,
                    )
                )
                await asyncio.sleep(1.2)
                self.assertFalse(request_task.done())

                paused = False
                await _action_queues[key].put(("fold", 0))
                action, amount = await asyncio.wait_for(request_task, timeout=1)

                self.assertEqual((action, amount), ("fold", 0))
                self.assertEqual(player.time_bank_seconds_remaining, 5)
            finally:
                _action_queues.pop(key, None)

        async_to_sync(run_scenario)()


class ConsumerTestBase(TransactionTestCase):
    """Harness for the socket tests: a tournament with two tables and no engine.

    A tournament left in "lobby" boots no engine, so these exercise the consumer
    on its own. Holds no tests of its own — subclasses bring those.
    """

    def setUp(self):
        _media_presence.clear()
        self.tournament = Tournament.objects.create(
            host=self._user("host"), name="Media", status="lobby", players_per_table=6,
        )
        self.table_one = TournamentTable.objects.create(tournament=self.tournament, table_number=1, max_seats=6)
        self.table_two = TournamentTable.objects.create(tournament=self.tournament, table_number=2, max_seats=6)

    def tearDown(self):
        _media_presence.clear()

    def _user(self, name):
        return User.objects.create_user(username=name, password="x")

    def _seat(self, name, table, seat):
        """Seat a player. `seat` is per-table; the tournament-wide seat is unique."""
        user = self._user(name)
        self._next_global_seat = getattr(self, "_next_global_seat", 0)
        TournamentPlayer.objects.create(
            tournament=self.tournament, user=user, table=table,
            seat=self._next_global_seat, seat_at_table=seat, chips=1000,
        )
        self._next_global_seat += 1
        return user

    def _communicator(self, user):
        communicator = WebsocketCommunicator(
            TournamentConsumer.as_asgi(), f"/ws/tournament/{self.tournament.id}/",
        )
        communicator.scope["user"] = user
        communicator.scope["url_route"] = {"kwargs": {"tournament_id": str(self.tournament.id)}}
        return communicator

    async def _drain(self, communicator):
        """Swallow the snapshot and anything else already queued.

        Never let a receive time out: asgiref cancels the application when it
        does, which would kill the very consumer under test.
        """
        while not await communicator.receive_nothing(timeout=0.2):
            await communicator.receive_json_from()

    async def _next_of_type(self, communicator, message_type, timeout=1):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if await communicator.receive_nothing(timeout=0.1):
                continue
            message = await communicator.receive_json_from()
            if message.get("type") == message_type:
                return message
        raise AssertionError(f"no {message_type} arrived")

class MediaSignallingTests(ConsumerTestBase):
    """The postbox players use to find each other's cameras."""

    def test_a_signal_reaches_the_player_it_names(self):
        ana = async_to_sync(sync_to_async(self._seat))("m_ana", self.table_one, 0)
        bea = async_to_sync(sync_to_async(self._seat))("m_bea", self.table_one, 1)

        async def scenario():
            ana_socket, bea_socket = self._communicator(ana), self._communicator(bea)
            await ana_socket.connect()
            await bea_socket.connect()
            await self._drain(ana_socket)
            await self._drain(bea_socket)

            await ana_socket.send_json_to({
                "type": "media_signal", "to_user_id": bea.id,
                "signal": {"kind": "offer", "sdp": "v=0"},
            })

            delivered = await self._next_of_type(bea_socket, "media_signal")
            self.assertEqual(delivered["from_user_id"], ana.id)
            self.assertEqual(delivered["signal"], {"kind": "offer", "sdp": "v=0"})

            await ana_socket.disconnect()
            await bea_socket.disconnect()

        async_to_sync(scenario)()

    def test_a_signal_to_another_table_is_dropped(self):
        ana = async_to_sync(sync_to_async(self._seat))("m_ana2", self.table_one, 0)
        far = async_to_sync(sync_to_async(self._seat))("m_far", self.table_two, 0)

        async def scenario():
            ana_socket, far_socket = self._communicator(ana), self._communicator(far)
            await ana_socket.connect()
            await far_socket.connect()
            await self._drain(ana_socket)
            await self._drain(far_socket)

            await ana_socket.send_json_to({
                "type": "media_signal", "to_user_id": far.id, "signal": {"kind": "offer"},
            })

            self.assertTrue(await far_socket.receive_nothing(timeout=0.4))

            await ana_socket.disconnect()
            await far_socket.disconnect()

        async_to_sync(scenario)()

    def test_announcing_returns_the_roster_and_tells_the_table(self):
        ana = async_to_sync(sync_to_async(self._seat))("m_ana3", self.table_one, 0)
        bea = async_to_sync(sync_to_async(self._seat))("m_bea3", self.table_one, 1)
        far = async_to_sync(sync_to_async(self._seat))("m_far3", self.table_two, 0)

        async def scenario():
            ana_socket = self._communicator(ana)
            bea_socket = self._communicator(bea)
            far_socket = self._communicator(far)
            for socket in (ana_socket, bea_socket, far_socket):
                await socket.connect()
                await self._drain(socket)

            # Ana is first in, so her roster is empty.
            await ana_socket.send_json_to({"type": "media_presence", "audio": True, "video": False})
            first_roster = await self._next_of_type(ana_socket, "media_roster")
            self.assertEqual(first_roster["peers"], [])
            # She is in the table group, so she also hears her own announcement.
            await self._drain(ana_socket)

            # Bea arrives and is told Ana is already there.
            await bea_socket.send_json_to({"type": "media_presence", "audio": True, "video": True})
            second_roster = await self._next_of_type(bea_socket, "media_roster")
            self.assertEqual(
                second_roster["peers"], [{"user_id": ana.id, "audio": True, "video": False}],
            )

            # Ana hears about Bea; the other table hears nothing at all.
            announced = await self._next_of_type(ana_socket, "media_presence")
            self.assertEqual((announced["user_id"], announced["video"]), (bea.id, True))
            self.assertTrue(await far_socket.receive_nothing(timeout=0.4))

            for socket in (ana_socket, bea_socket, far_socket):
                await socket.disconnect()

        async_to_sync(scenario)()

    def test_turning_everything_off_leaves_the_table(self):
        ana = async_to_sync(sync_to_async(self._seat))("m_ana4", self.table_one, 0)
        bea = async_to_sync(sync_to_async(self._seat))("m_bea4", self.table_one, 1)

        async def scenario():
            ana_socket, bea_socket = self._communicator(ana), self._communicator(bea)
            for socket in (ana_socket, bea_socket):
                await socket.connect()
                await self._drain(socket)

            await ana_socket.send_json_to({"type": "media_presence", "audio": True, "video": True})
            await self._next_of_type(ana_socket, "media_roster")
            await self._drain(bea_socket)

            await ana_socket.send_json_to({"type": "media_presence", "audio": False, "video": False})

            left = await self._next_of_type(bea_socket, "media_left")
            self.assertEqual(left["user_id"], ana.id)
            self.assertEqual(_media_presence, {})

            await ana_socket.disconnect()
            await bea_socket.disconnect()

        async_to_sync(scenario)()

    def test_a_disconnect_takes_the_presence_with_it(self):
        ana = async_to_sync(sync_to_async(self._seat))("m_ana5", self.table_one, 0)
        bea = async_to_sync(sync_to_async(self._seat))("m_bea5", self.table_one, 1)

        async def scenario():
            ana_socket, bea_socket = self._communicator(ana), self._communicator(bea)
            for socket in (ana_socket, bea_socket):
                await socket.connect()
                await self._drain(socket)

            await ana_socket.send_json_to({"type": "media_presence", "audio": True, "video": True})
            await self._next_of_type(ana_socket, "media_roster")
            await self._drain(bea_socket)

            await ana_socket.disconnect()

            left = await self._next_of_type(bea_socket, "media_left")
            self.assertEqual(left["user_id"], ana.id)
            self.assertEqual(_media_presence, {})

            await bea_socket.disconnect()

        async_to_sync(scenario)()

    def test_a_superseded_socket_does_not_clear_the_live_one(self):
        """A reconnect must not tear down the presence the new socket announced.

        This is the same trap the hole-card unicast fell into: the old socket
        tears down after the new one registered, and would clear shared state
        belonging to the live connection.
        """
        ana = async_to_sync(sync_to_async(self._seat))("m_ana6", self.table_one, 0)

        async def scenario():
            first = self._communicator(ana)
            await first.connect()
            await self._drain(first)

            second = self._communicator(ana)
            await second.connect()
            await self._drain(second)

            await second.send_json_to({"type": "media_presence", "audio": True, "video": False})
            await self._next_of_type(second, "media_roster")

            # The superseded socket goes away afterwards, as a real reconnect does.
            await first.disconnect()
            await asyncio.sleep(0.2)

            self.assertIn((self.tournament.id, ana.id), _media_presence)

            await second.disconnect()

        async_to_sync(scenario)()

    def test_a_flood_of_signalling_is_cut_off(self):
        ana = async_to_sync(sync_to_async(self._seat))("m_ana7", self.table_one, 0)
        bea = async_to_sync(sync_to_async(self._seat))("m_bea7", self.table_one, 1)

        async def scenario():
            ana_socket, bea_socket = self._communicator(ana), self._communicator(bea)
            for socket in (ana_socket, bea_socket):
                await socket.connect()
                await self._drain(socket)

            for _ in range(MEDIA_MESSAGE_BUDGET + 20):
                await ana_socket.send_json_to({
                    "type": "media_signal", "to_user_id": bea.id, "signal": {"kind": "ice"},
                })

            received = 0
            while not await bea_socket.receive_nothing(timeout=0.4):
                message = await bea_socket.receive_json_from()
                if message.get("type") == "media_signal":
                    received += 1

            self.assertEqual(received, MEDIA_MESSAGE_BUDGET)

            await ana_socket.disconnect()
            await bea_socket.disconnect()

        async_to_sync(scenario)()


class SpectatorConnectionTests(ConsumerTestBase):
    """The rail: anyone may watch a live table, and nobody may play from it."""

    def _spectator_socket(self, user, query):
        communicator = WebsocketCommunicator(
            TournamentConsumer.as_asgi(), f"/ws/tournament/{self.tournament.id}/?{query}",
        )
        communicator.scope["user"] = user
        communicator.scope["url_route"] = {"kwargs": {"tournament_id": str(self.tournament.id)}}
        return communicator

    def _running(self):
        self.tournament.status = "running"
        self.tournament.save(update_fields=["status"])

    def test_a_stranger_is_refused_unless_they_ask_to_watch(self):
        visitor = self._user("rail_nosy")
        async_to_sync(sync_to_async(self._running))()

        async def scenario():
            socket = self._communicator(visitor)
            connected, _ = await socket.connect()
            self.assertFalse(connected)

        async_to_sync(scenario)()

    def test_a_stranger_may_watch_a_running_tournament(self):
        visitor = self._user("rail_watcher")
        async_to_sync(sync_to_async(self._running))()

        async def scenario():
            socket = self._spectator_socket(visitor, "spectate=1&table=2")
            connected, _ = await socket.connect()
            self.assertTrue(connected)
            # No action channel, so nothing the engine unicasts can reach them.
            self.assertNotIn((self.tournament.id, visitor.id), _player_channels)
            await socket.send_json_to({"type": "player_action", "action": "fold"})
            self.assertTrue(await socket.receive_nothing(timeout=0.2))
            await socket.disconnect()

        async_to_sync(scenario)()

    def test_a_tournament_that_has_not_started_has_nothing_to_watch(self):
        visitor = self._user("rail_early")

        async def scenario():
            socket = self._spectator_socket(visitor, "spectate=1&table=1")
            connected, _ = await socket.connect()
            self.assertFalse(connected)

        async_to_sync(scenario)()

    def test_a_busted_player_may_watch_a_table_other_than_their_own(self):
        def setup():
            user = self._seat("rail_busted", self.table_one, 0)
            TournamentPlayer.objects.filter(tournament=self.tournament, user=user).update(
                is_eliminated=True, finish_position=9,
            )
            self._running()
            return user

        busted = async_to_sync(sync_to_async(setup))()

        async def scenario():
            socket = self._spectator_socket(busted, "spectate=1&table=2")
            connected, _ = await socket.connect()
            self.assertTrue(connected)
            # Watching, not seated: the action channel stays closed to them.
            self.assertNotIn((self.tournament.id, busted.id), _player_channels)
            await socket.disconnect()

        async_to_sync(scenario)()


class FinalBlindLevelTests(TestCase):
    """What the structure does once it runs out of levels."""

    def _coordinator(self, levels):
        async def noop(*args, **kwargs):
            return None

        return MultiTableTournamentCoordinator(
            tournament_id=1, players_per_table=6, levels=levels,
            broadcast_tournament=noop, broadcast_table=noop,
            request_action=noop, notify_user=noop,
            load_players=noop, persist_assignments=noop, persist_player_states=noop,
        )

    def test_the_last_level_never_ends(self):
        levels = [
            {"small_blind": 10, "big_blind": 20, "ante": 0, "duration_hands": 2},
            {"small_blind": 25, "big_blind": 50, "ante": 0, "duration_hands": 2},
        ]
        coordinator = self._coordinator(levels)

        coordinator._hands_in_level = 99
        coordinator._advance_level()
        self.assertEqual(coordinator._level_index, 1)

        # Far past its stated duration, and it stays put: there is nothing after
        # it, and inventing blinds the host never set would be worse.
        coordinator._hands_in_level = 999
        coordinator._advance_level()
        self.assertEqual(coordinator._level_index, 1)
        self.assertEqual(coordinator._current_level()["big_blind"], 50)

    def test_a_break_left_at_the_end_falls_back_to_playable_blinds(self):
        levels = [
            {"small_blind": 10, "big_blind": 20, "ante": 0, "duration_hands": 2},
            {"small_blind": 25, "big_blind": 50, "ante": 0, "duration_hands": 2},
            {"is_break": True, "duration_minutes": 5},
        ]
        coordinator = self._coordinator(levels)

        self.assertEqual(coordinator._last_playable_level_index(), 1)

    def test_a_structure_of_nothing_but_breaks_has_no_fallback(self):
        coordinator = self._coordinator([{"is_break": True, "duration_minutes": 5}])

        self.assertIsNone(coordinator._last_playable_level_index())


class TableChatTests(ConsumerTestBase):
    """Chat rides the same socket, and stays at your own table."""

    def test_a_message_reaches_your_table_and_no_other(self):
        ana = async_to_sync(sync_to_async(self._seat))("c_ana", self.table_one, 0)
        bea = async_to_sync(sync_to_async(self._seat))("c_bea", self.table_one, 1)
        far = async_to_sync(sync_to_async(self._seat))("c_far", self.table_two, 0)

        async def scenario():
            sockets = [self._communicator(user) for user in (ana, bea, far)]
            for socket in sockets:
                await socket.connect()
                await self._drain(socket)

            await sockets[0].send_json_to({"type": "chat_message", "text": "  boa sorte  "})

            heard = await self._next_of_type(sockets[1], "chat_message")
            self.assertEqual((heard["name"], heard["text"]), ("c_ana", "boa sorte"))
            self.assertTrue(await sockets[2].receive_nothing(timeout=0.4))

            for socket in sockets:
                await socket.disconnect()

        async_to_sync(scenario)()

    def test_an_empty_message_is_not_sent(self):
        ana = async_to_sync(sync_to_async(self._seat))("c_ana2", self.table_one, 0)
        bea = async_to_sync(sync_to_async(self._seat))("c_bea2", self.table_one, 1)

        async def scenario():
            ana_socket, bea_socket = self._communicator(ana), self._communicator(bea)
            for socket in (ana_socket, bea_socket):
                await socket.connect()
                await self._drain(socket)

            await ana_socket.send_json_to({"type": "chat_message", "text": "   "})

            self.assertTrue(await bea_socket.receive_nothing(timeout=0.4))

            await ana_socket.disconnect()
            await bea_socket.disconnect()

        async_to_sync(scenario)()

    def test_a_flood_is_cut_off(self):
        ana = async_to_sync(sync_to_async(self._seat))("c_ana3", self.table_one, 0)
        bea = async_to_sync(sync_to_async(self._seat))("c_bea3", self.table_one, 1)

        async def scenario():
            ana_socket, bea_socket = self._communicator(ana), self._communicator(bea)
            for socket in (ana_socket, bea_socket):
                await socket.connect()
                await self._drain(socket)

            for index in range(CHAT_MESSAGE_BUDGET + 5):
                await ana_socket.send_json_to({"type": "chat_message", "text": f"spam {index}"})

            received = 0
            while not await bea_socket.receive_nothing(timeout=0.4):
                if (await bea_socket.receive_json_from()).get("type") == "chat_message":
                    received += 1

            self.assertEqual(received, CHAT_MESSAGE_BUDGET)

            await ana_socket.disconnect()
            await bea_socket.disconnect()

        async_to_sync(scenario)()


class ChipConservationTests(TestCase):
    """Chips are conserved. A hand moves them; it never makes them.

    This is the invariant the whole tournament rests on: if a hand can create a
    chip, the final stack stops meaning anything.
    """

    def _play(self, stacks, *, ante, small_blind, big_blind, seed):
        random.seed(seed)
        players = [Player(f"p{i}", chips) for i, chips in enumerate(stacks)]
        for seat, player in enumerate(players):
            player._seat = seat

        async def broadcast(event_type, payload):
            return None

        async def request_action(player, context):
            valid = context["valid_actions"]
            choice = random.choice(valid)
            if choice == "raise":
                low, high = context["min_raise"], context["max_raise"]
                return "raise", random.randint(low, high) if high > low else low
            return choice, 0

        engine = HandEngine(
            players=players, dealer_pos=seed % len(players),
            small_blind=small_blind, big_blind=big_blind, ante=ante,
            hand_number=1, broadcast=broadcast, request_action=request_action,
        )
        async_to_sync(engine.run)()
        return players

    def test_a_hand_never_creates_or_destroys_a_chip(self):
        # Deliberately awkward shapes: stacks too short to cover a blind, antes
        # bigger than a stack, and uneven stacks that force side pots. Kept to a
        # handful of seeds because an all-in run-out pauses three seconds a
        # street to show the cards.
        shapes = [
            [1000, 1000],
            [1000, 300],
            [10000, 4321, 250, 75],
            [500, 500, 500],
        ]
        for shape in shapes:
            for ante in (0, 25):
                for seed in range(3):
                    before = sum(shape)
                    players = self._play(shape, ante=ante, small_blind=50, big_blind=100, seed=seed)
                    after = sum(p.chips for p in players)
                    self.assertEqual(
                        after, before,
                        f"stacks {shape}, ante {ante}, seed {seed}: {before} chips went in, {after} came out",
                    )


class UntrustedActionTests(TestCase):
    """What arrives from a client is a suggestion, not an instruction."""

    def _hand(self, stacks, responder):
        players = [Player(f"p{i}", chips) for i, chips in enumerate(stacks)]
        for seat, player in enumerate(players):
            player._seat = seat

        async def broadcast(event_type, payload):
            return None

        engine = HandEngine(
            players=players, dealer_pos=0, small_blind=50, big_blind=100, ante=0,
            hand_number=1, broadcast=broadcast, request_action=responder,
        )
        async_to_sync(engine.run)()
        return players

    def test_a_raise_below_your_own_bet_cannot_pull_chips_back(self):
        """The bug that let a player take their blind back off the table.

        `raise to 10` while already holding 100 in front of you used to compute a
        negative commitment, and the chip arithmetic ran backwards.
        """
        seen = []

        async def responder(player, context):
            seen.append(player.chips)
            if "raise" in context["valid_actions"] and player.current_bet > 10:
                return "raise", 10
            return ("check" if "check" in context["valid_actions"] else "fold"), 0

        players = self._hand([10000, 10000], responder)

        # Nobody ever ends a hand with more than they started, having only bet.
        self.assertLessEqual(max(p.chips for p in players), 20000)
        self.assertEqual(sum(p.chips for p in players), 20000)

    def test_an_action_that_was_not_offered_is_not_obeyed(self):
        async def responder(player, context):
            return "check", 0   # even when facing a bet, where checking is illegal

        players = self._hand([10000, 300], responder)

        self.assertEqual(sum(p.chips for p in players), 10300)

    def test_a_nonsense_raise_amount_is_pulled_into_range(self):
        async def responder(player, context):
            if "raise" in context["valid_actions"]:
                return "raise", "not a number"
            return ("check" if "check" in context["valid_actions"] else "fold"), 0

        players = self._hand([10000, 10000], responder)

        self.assertEqual(sum(p.chips for p in players), 20000)


class ChipDriftDetectionTests(TestCase):
    """The tournament notices when its own chip total moves under it."""

    def _coordinator(self):
        async def noop(*args, **kwargs):
            return None

        coordinator = MultiTableTournamentCoordinator(
            tournament_id=7, players_per_table=6,
            levels=[{"small_blind": 10, "big_blind": 20, "ante": 0, "duration_hands": 8}],
            broadcast_tournament=noop, broadcast_table=noop, request_action=noop,
            notify_user=noop, load_players=noop, persist_assignments=noop,
            persist_player_states=noop,
        )
        for index, chips in enumerate([1000, 1000, 1000]):
            player = Player(f"p{index}", chips)
            player._tp_id = index
            player._user_id = 100 + index
            player._table_number = 1
            player._seat = index
            coordinator._players_by_id[index] = player
            coordinator._players_by_user_id[player._user_id] = player
        coordinator._expected_chip_total = coordinator._chip_total()
        coordinator._chip_total_known = True
        return coordinator

    def test_a_stack_growing_out_of_nowhere_is_reported(self):
        coordinator = self._coordinator()
        coordinator._players_by_id[0].chips += 250

        with patch("builtins.print") as printed:
            coordinator._check_chip_total("in a test")

        self.assertTrue(printed.called)
        self.assertIn("+250", printed.call_args[0][0])

    def test_an_honest_hand_says_nothing(self):
        coordinator = self._coordinator()
        # Chips moving between players is the whole point of a hand.
        coordinator._players_by_id[0].chips -= 400
        coordinator._players_by_id[1].chips += 400

        with patch("builtins.print") as printed:
            coordinator._check_chip_total("in a test")

        self.assertFalse(printed.called)

    def test_a_rebuy_is_expected_to_add_chips(self):
        coordinator = self._coordinator()
        player = coordinator._players_by_id[2]
        player.chips = 0
        coordinator._expected_chip_total -= 1000   # they busted
        async_to_sync(coordinator.apply_rebuy)(player._user_id, 1000)

        with patch("builtins.print") as printed:
            coordinator._check_chip_total("in a test")

        self.assertFalse(printed.called)

    def test_the_report_names_the_stack_that_moved(self):
        """The amount alone says a defect happened; the stacks say where."""
        coordinator = self._coordinator()
        coordinator._check_chip_total("baseline")
        coordinator._players_by_id[1].chips += 250

        with patch("builtins.print") as printed:
            coordinator._check_chip_total("in a test")

        message = printed.call_args[0][0]
        self.assertIn("p1=1250 (+250)", message)
        self.assertIn("p0=1000 (+0)", message)


class HandSnapshotTests(CoordinatorHarness, TestCase):
    """A written hand carries the stacks it opened and closed with.

    Without them a chip appearing between hands leaves no trace: the action
    list records what was bet, never what anybody actually held.
    """

    def test_a_persisted_hand_records_opening_and_closing_stacks(self):
        coordinator = self._build_coordinator(
            [self._record(index) for index in range(3)],
            players_per_table=3,
        )
        self._sync_and_rebalance(coordinator)

        written = []

        async def persist_hand(payload):
            written.append(payload)

        coordinator.persist_hand = persist_hand

        async_to_sync(coordinator._broadcast_to_table)(
            1, "hand_started", {"hand_number": 4, "dealer_seat": 0},
        )
        async_to_sync(coordinator._broadcast_to_table)(
            1, "action_taken", {"seat": 0, "action": "bet", "amount": 100},
        )
        async_to_sync(coordinator._broadcast_to_table)(
            1,
            "hand_complete",
            {"stacks": [
                {"seat": 0, "chips": 900},
                {"seat": 1, "chips": 1100},
                {"seat": 2, "chips": 1000},
            ]},
        )

        result = written[0]["result"]
        self.assertEqual(
            result["opening_stacks"],
            [
                {"seat": 0, "tp_id": 1, "chips": 1000},
                {"seat": 1, "tp_id": 2, "chips": 1000},
                {"seat": 2, "tp_id": 3, "chips": 1000},
            ],
        )
        self.assertEqual(
            result["closing_stacks"],
            [
                {"seat": 0, "tp_id": 1, "chips": 900},
                {"seat": 1, "tp_id": 2, "chips": 1100},
                {"seat": 2, "tp_id": 3, "chips": 1000},
            ],
        )


class MysterySnapshotTests(CoordinatorHarness, TestCase):
    """A player who reloads still sees the mystery board.

    It used to arrive only on the broadcast that opened the envelopes, so a
    refresh after that point left the table with no envelope count — and, once
    the felt started marking every head with one, no marks either.
    """

    def _mystery_coordinator(self, envelopes, opened):
        from tournaments.bounties import BountyConfig

        coordinator = self._build_coordinator(
            [self._record(index) for index in range(3)], players_per_table=3,
        )
        coordinator.bounty = BountyConfig(mode="mystery", amount_cents=1000)
        coordinator._mystery_envelopes = list(envelopes)
        coordinator._mystery_opened = opened
        coordinator.mystery_release = "reg_closed"
        self._sync_and_rebalance(coordinator)
        return coordinator

    def test_the_snapshot_carries_what_is_left_on_the_board(self):
        coordinator = self._mystery_coordinator([5000, 2000, 1000], opened=True)

        snapshot = coordinator._table_snapshot(coordinator._tables[1], [])

        self.assertEqual(snapshot["mystery"], {
            "opened": True,
            "envelopes_left": 3,
            "pool_left_cents": 8000,
            "top_left_cents": 5000,
            "release": "reg_closed",
        })

    def test_a_sealed_pool_says_so_rather_than_saying_nothing(self):
        coordinator = self._mystery_coordinator([], opened=False)

        snapshot = coordinator._table_snapshot(coordinator._tables[1], [])

        self.assertFalse(snapshot["mystery"]["opened"])
        self.assertEqual(snapshot["mystery"]["envelopes_left"], 0)

    def test_a_tournament_with_no_mystery_pool_has_no_board(self):
        coordinator = self._build_coordinator(
            [self._record(index) for index in range(3)], players_per_table=3,
        )
        self._sync_and_rebalance(coordinator)

        snapshot = coordinator._table_snapshot(coordinator._tables[1], [])

        self.assertIsNone(snapshot["mystery"])

    def test_the_board_empties_as_the_envelopes_are_drawn(self):
        coordinator = self._mystery_coordinator([5000, 2000], opened=True)
        coordinator._mystery_envelopes = [2000]

        snapshot = coordinator._table_snapshot(coordinator._tables[1], [])

        self.assertEqual(snapshot["mystery"]["envelopes_left"], 1)
        self.assertEqual(snapshot["mystery"]["top_left_cents"], 2000)


class GifIdTests(TestCase):
	"""A GIF is an id, never a URL. Everything else about the feature rests on
	that, so the rule is checked rather than assumed."""

	def test_a_plain_giphy_id_is_kept(self):
		from game.giphy import clean_gif_id

		self.assertEqual(clean_gif_id("3o7abKhOpu0NwenH3O"), "3o7abKhOpu0NwenH3O")
		self.assertEqual(clean_gif_id("  l0He-Xyz_9  "), "l0He-Xyz_9")

	def test_a_url_is_not_an_id(self):
		from game.giphy import clean_gif_id

		# The whole point: nobody gets to name the host an image comes from.
		self.assertIsNone(clean_gif_id("https://evil.example/tracker.gif"))
		self.assertIsNone(clean_gif_id("//media.giphy.com/media/abc/giphy.gif"))
		self.assertIsNone(clean_gif_id("abc/../../etc/passwd"))
		self.assertIsNone(clean_gif_id("<img src=x onerror=alert(1)>"))

	def test_nothing_is_nothing(self):
		from game.giphy import clean_gif_id

		self.assertIsNone(clean_gif_id(""))
		self.assertIsNone(clean_gif_id(None))
		self.assertIsNone(clean_gif_id("   "))

	def test_an_absurdly_long_id_is_refused(self):
		from game.giphy import clean_gif_id

		self.assertIsNone(clean_gif_id("a" * 65))


class TimeBankWhileDisconnectedTests(TestCase):
	"""A time bank is time to think, and somebody whose connection dropped is
	not thinking with it."""

	def _scenario(self, connected, base_timer=1, bank=4):
		async def run_scenario():
			tournament_id = 998
			user_id = 321
			key = (tournament_id, user_id)
			_action_queues[key] = asyncio.Queue()
			if connected:
				_player_channels[key] = "a-channel"

			player = Player("away player", 1000)
			player._user_id = user_id
			player._seat = 0
			player.time_bank_seconds_remaining = bank

			try:
				return await _request_action(
					tournament_id,
					1,
					player,
					{"valid_actions": ["fold", "check"], "action_timer_seconds": base_timer},
				), player
			finally:
				_action_queues.pop(key, None)
				_player_channels.pop(key, None)

		return async_to_sync(run_scenario)()

	def test_a_disconnected_player_keeps_their_bank(self):
		(action, _amount), player = self._scenario(connected=False)

		# Their turn still ends with the base timer — one dropped connection
		# must not hold up everyone else for as long as it stays dropped.
		self.assertEqual(action, "check")
		self.assertEqual(player.time_bank_seconds_remaining, 4)

	def test_a_connected_player_who_sits_there_spends_it(self):
		(action, _amount), player = self._scenario(connected=True, base_timer=0, bank=1)

		self.assertEqual(action, "check")
		self.assertEqual(player.time_bank_seconds_remaining, 0)


class ThrowableTests(TestCase):
	"""What may be thrown. The list is the whole security of the feature: a
	client that could name what it throws could throw anything at anybody."""

	def test_an_item_from_the_list_is_kept(self):
		from game.throwables import clean_item

		self.assertEqual(clean_item("tomato"), "tomato")
		self.assertEqual(clean_item("  ROSE "), "rose")

	def test_anything_else_is_not_a_throwable(self):
		from game.throwables import clean_item

		self.assertIsNone(clean_item("grenade"))
		self.assertIsNone(clean_item("<img src=x onerror=alert(1)>"))
		self.assertIsNone(clean_item("https://example.test/nasty.gif"))
		self.assertIsNone(clean_item(""))
		self.assertIsNone(clean_item(None))


class ThrowRelayTests(TransactionTestCase):
	"""Throwing across a live table."""

	def _consumer(self, tournament_id=4321, user_id=1):
		"""A consumer with just enough on it to reach _throw_item.

		`sent_to_self` collects what would go back down this player's own
		socket, which is how a refused throw tells them to wait.
		"""
		consumer = TournamentConsumer()
		consumer.tournament_id = tournament_id
		consumer.user = type("U", (), {"id": user_id})()
		consumer.shown_name = "thrower"
		consumer.sent_to_self = []

		async def send(text_data=None, **kwargs):
			consumer.sent_to_self.append(json.loads(text_data))

		consumer.send = send
		return consumer

	def _runner(self, seats):
		"""seats: {user_id: (seat, table_number)}"""
		class Player:
			def __init__(self, seat, table_number, name):
				self._seat = seat
				self._table_number = table_number
				self.name = name

		class Runner:
			def get_runtime_player(self, user_id):
				spec = seats.get(user_id)
				return Player(spec[0], spec[1], f"p{user_id}") if spec else None

		return Runner()

	def _throw(self, seats, payload, tournament_id=4321, user_id=1):
		from game.consumers import _tournament_runners

		sent = []

		async def capture(tid, table, event_type, data):
			sent.append((event_type, data))

		_tournament_runners[tournament_id] = self._runner(seats)
		consumer = self._consumer(tournament_id, user_id)
		with patch("game.consumers._broadcast_table", capture):
			async_to_sync(consumer._throw_item)(payload)
		_tournament_runners.pop(tournament_id, None)
		return sent

	def test_a_throw_reaches_the_table(self):
		sent = self._throw(
			{1: (0, 1), 2: (3, 1)}, {"item": "tomato", "at_user_id": 2},
		)

		self.assertEqual(len(sent), 1)
		event_type, data = sent[0]
		self.assertEqual(event_type, "item_thrown")
		self.assertEqual(data["item"], "tomato")
		self.assertEqual((data["from_seat"], data["to_seat"]), (0, 3))

	def test_an_item_nobody_offers_is_refused(self):
		self.assertEqual(
			self._throw({1: (0, 1), 2: (3, 1)}, {"item": "brick", "at_user_id": 2}), [],
		)

	def test_you_cannot_throw_at_another_table(self):
		"""Otherwise this is a way to put an object on the screen of anybody
		whose id you can guess, at a table you are not even at."""
		self.assertEqual(
			self._throw({1: (0, 1), 2: (3, 2)}, {"item": "egg", "at_user_id": 2}), [],
		)

	def test_you_cannot_throw_at_yourself(self):
		self.assertEqual(
			self._throw({1: (0, 1)}, {"item": "egg", "at_user_id": 1}), [],
		)

	def test_a_target_who_is_not_at_the_table_is_refused(self):
		self.assertEqual(
			self._throw({1: (0, 1)}, {"item": "egg", "at_user_id": 99}), [],
		)

	def test_nonsense_for_a_target_is_refused(self):
		self.assertEqual(
			self._throw({1: (0, 1), 2: (3, 1)}, {"item": "egg", "at_user_id": "everyone"}), [],
		)

	def test_a_burst_gets_through_and_the_flood_behind_it_does_not(self):
		"""Three in a row is a joke; twenty is a way of stopping somebody
		playing. See throwlimit.py — it lands on another player's screen rather
		than in a panel they can close."""
		from game.consumers import _tournament_runners
		from game.throwlimit import BURST

		seats = {1: (0, 1), 2: (3, 1)}
		sent = []

		async def capture(tid, table, event_type, data):
			sent.append(data)

		_tournament_runners[4321] = self._runner(seats)
		consumer = self._consumer()
		with patch("game.consumers._broadcast_table", capture):
			for _ in range(20):
				async_to_sync(consumer._throw_item)({"item": "egg", "at_user_id": 2})
		_tournament_runners.pop(4321, None)

		self.assertEqual(len(sent), BURST)

	def test_a_refused_throw_says_how_long_to_wait(self):
		"""A button that does nothing reads as a broken button, and the player
		then presses it more."""
		from game.consumers import _tournament_runners
		from game.throwlimit import BURST, COOLDOWN_SECONDS

		_tournament_runners[4321] = self._runner({1: (0, 1), 2: (3, 1)})
		consumer = self._consumer()

		async def capture(tid, table, event_type, data):
			return None

		with patch("game.consumers._broadcast_table", capture):
			for _ in range(BURST + 2):
				async_to_sync(consumer._throw_item)({"item": "egg", "at_user_id": 2})
		_tournament_runners.pop(4321, None)

		refusals = [one for one in consumer.sent_to_self if one["type"] == "throw_cooldown"]
		self.assertEqual(len(refusals), 2)
		for refusal in refusals:
			self.assertGreater(refusal["seconds"], 0)
			self.assertLessEqual(refusal["seconds"], COOLDOWN_SECONDS)


class LevelClockTests(TestCase):
    """Late registration, answered in seconds instead of level numbers."""

    SCHEDULE = [
        {"small_blind": 10, "big_blind": 20, "duration_minutes": 10},
        {"small_blind": 20, "big_blind": 40, "duration_minutes": 10},
        {"is_break": True, "small_blind": 0, "big_blind": 0, "duration_minutes": 5},
        {"small_blind": 30, "big_blind": 60, "duration_minutes": 10},
        {"small_blind": 50, "big_blind": 100, "duration_minutes": 10},
    ]

    def test_counts_the_rest_of_this_level(self):
        self.assertEqual(seconds_until_level_ends(self.SCHEDULE, 0, 120, 1), 480)

    def test_counts_the_break_in_the_way(self):
        # Two minutes into level 1, closing at the end of level 4: what is left
        # of this level, then levels 2, 3 and 4 — and the five-minute break,
        # which is five more minutes you can still register in.
        self.assertEqual(seconds_until_level_ends(self.SCHEDULE, 0, 120, 4), 480 + 600 + 300 + 600 + 600)

    def test_a_level_already_played_has_no_time_left(self):
        self.assertIsNone(seconds_until_level_ends(self.SCHEDULE, 1, 0, 1))

    def test_a_level_counted_in_hands_cannot_be_timed(self):
        schedule = [{"small_blind": 10, "big_blind": 20, "duration_hands": 8}, *self.SCHEDULE]
        self.assertIsNone(seconds_until_level_ends(schedule, 0, 0, 3))

    def test_a_target_beyond_the_schedule_is_not_invented(self):
        self.assertIsNone(seconds_until_level_ends(self.SCHEDULE, 0, 0, 9))

    def test_an_overrun_level_is_not_negative(self):
        # The clock can read past the end of a level between the last hand and
        # the blinds going up.
        self.assertEqual(seconds_until_level_ends(self.SCHEDULE, 0, 900, 1), 0)


class SideBetArithmeticTests(TestCase):
    """Who called the hand right, and the tally that follows them around."""

    def test_backing_the_winner_is_right(self):
        results = settle({7: 1, 8: 2}, [1])
        self.assertEqual(
            results,
            [
                {"user_id": 7, "on_user_id": 1, "correct": True},
                {"user_id": 8, "on_user_id": 2, "correct": False},
            ],
        )

    def test_a_split_pot_makes_both_backers_right(self):
        results = settle({7: 1, 8: 2}, [1, 2])
        self.assertTrue(all(one["correct"] for one in results))

    def test_a_pick_who_folded_afterwards_is_wrong(self):
        # Nothing special happens: they are not among the winners, so the call
        # was wrong — which is the risk of calling it on the flop.
        self.assertFalse(settle({7: 3}, [1])[0]["correct"])

    def test_the_tally_counts_calls_and_hits(self):
        records = updated_records({}, settle({7: 1, 8: 2}, [1]))
        self.assertEqual(records[7], {"right": 1, "called": 1})
        self.assertEqual(records[8], {"right": 0, "called": 1})

        records = updated_records(records, settle({7: 5}, [1]))
        self.assertEqual(records[7], {"right": 1, "called": 2})

    def test_the_tally_is_never_edited_in_place(self):
        before = {7: {"right": 1, "called": 1}}
        updated_records(before, settle({7: 1}, [1]))
        self.assertEqual(before, {7: {"right": 1, "called": 1}})

    def test_someone_who_has_never_called_has_a_record_anyway(self):
        self.assertEqual(record_for({}, 99), {"right": 0, "called": 0})


class SideBetRulesTests(CoordinatorHarness, TestCase):
    """Who may back whom, and when the book shuts."""

    def _hand_in_progress(self):
        coordinator = self._build_coordinator(
            [self._record(index, table_number=1, seat_at_table=index) for index in range(3)],
            players_per_table=3,
        )
        self._sync_and_rebalance(coordinator)
        coordinator._open_side_bets(coordinator._tables[1])
        return coordinator

    def _fold(self, coordinator, user_id):
        coordinator._players_by_user_id[user_id].is_folded = True

    def test_a_folded_player_can_back_somebody_still_in(self):
        coordinator = self._hand_in_progress()
        self._fold(coordinator, 100)

        self.assertTrue(async_to_sync(coordinator.place_side_bet)(100, 101, 50))
        self.assertEqual(coordinator.side_bets_at(1)["bets"][0]["on_user_id"], 101)
        self.assertIn("side_bet_placed", [event for _table, event, _payload in self.table_events])

    def test_a_player_still_in_the_hand_cannot_bet_on_it(self):
        coordinator = self._hand_in_progress()
        self.assertFalse(async_to_sync(coordinator.place_side_bet)(100, 101, 50))

    def test_you_cannot_back_somebody_who_has_folded(self):
        coordinator = self._hand_in_progress()
        self._fold(coordinator, 100)
        self._fold(coordinator, 101)
        self.assertFalse(async_to_sync(coordinator.place_side_bet)(100, 101, 50))

    def test_a_call_cannot_be_taken_back(self):
        coordinator = self._hand_in_progress()
        self._fold(coordinator, 100)

        self.assertTrue(async_to_sync(coordinator.place_side_bet)(100, 101, 50))
        self.assertFalse(async_to_sync(coordinator.place_side_bet)(100, 102, 50))
        self.assertEqual(coordinator.side_bets_at(1)["bets"][0]["on_user_id"], 101)

    def test_the_book_shuts_when_the_cards_come_face_up(self):
        coordinator = self._hand_in_progress()
        self._fold(coordinator, 100)

        async_to_sync(coordinator._hand_event)(1, "showdown", [])

        self.assertFalse(coordinator.side_bets_at(1)["open"])
        self.assertFalse(async_to_sync(coordinator.place_side_bet)(100, 101, 50))

    def test_an_all_in_runout_shuts_it_too(self):
        coordinator = self._hand_in_progress()
        self._fold(coordinator, 100)

        async_to_sync(coordinator._hand_event)(1, "all_in_equity", [])

        self.assertFalse(async_to_sync(coordinator.place_side_bet)(100, 101, 50))

    def test_the_pot_settles_the_calls_and_moves_the_tally(self):
        coordinator = self._hand_in_progress()
        self._fold(coordinator, 100)
        async_to_sync(coordinator.place_side_bet)(100, 101, 50)

        # Seat 1 is player 101 — the one that was backed.
        async_to_sync(coordinator._hand_event)(1, "pot_awarded", [{"seat": 1, "amount": 60}])

        results = [
            payload for _table, event, payload in self.table_events
            if event == "side_bet_results"
        ][-1]["results"]
        self.assertEqual(len(results), 1)
        self.assertTrue(results[0]["correct"])
        self.assertEqual(results[0]["record"], {"right": 1, "called": 1})
        # And the book is empty again, so the same call cannot settle twice.
        self.assertEqual(coordinator.side_bets_at(1)["bets"], [])

    def test_backing_a_loser_is_recorded_as_a_miss(self):
        coordinator = self._hand_in_progress()
        self._fold(coordinator, 100)
        async_to_sync(coordinator.place_side_bet)(100, 101, 50)

        async_to_sync(coordinator._hand_event)(1, "pot_awarded", [{"seat": 2, "amount": 60}])

        results = [
            payload for _table, event, payload in self.table_events
            if event == "side_bet_results"
        ][-1]["results"]
        self.assertFalse(results[0]["correct"])
        self.assertEqual(results[0]["record"], {"right": 0, "called": 1})

    def test_a_reconnecting_client_is_handed_the_open_book(self):
        coordinator = self._hand_in_progress()
        self._fold(coordinator, 100)
        async_to_sync(coordinator.place_side_bet)(100, 101, 50)

        snapshot = async_to_sync(coordinator.snapshot_for_table)(1)

        self.assertTrue(snapshot["side_bets"]["open"])
        self.assertEqual(snapshot["side_bets"]["bets"][0]["user_id"], 100)


class BestHandRankingTests(TestCase):
    """Which of two showdown hands was the better one."""

    def test_a_better_category_wins(self):
        flush = {"hand_name": "Flush", "score": [5, 14]}
        straight = {"hand_name": "Straight", "score": [4, 14]}
        self.assertEqual(best_of([straight, flush]), flush)

    def test_the_score_separates_two_of_a_kind(self):
        kings = {"hand_name": "Full House", "score": [6, 13, 10]}
        aces = {"hand_name": "Full House", "score": [6, 14, 2]}
        self.assertEqual(best_of([kings, aces]), aces)

    def test_a_royal_flush_beats_a_straight_flush(self):
        royal = {"hand_name": "Royal Flush", "score": [8, 14]}
        steel = {"hand_name": "Straight Flush", "score": [8, 11]}
        self.assertEqual(best_of([steel, royal]), royal)

    def test_a_hand_recorded_before_scores_still_ranks_by_category(self):
        old_flush = {"hand_name": "Flush"}
        new_pair = {"hand_name": "One Pair", "score": [1, 14, 13, 12, 11]}
        self.assertEqual(best_of([old_flush, new_pair]), old_flush)

    def test_a_scored_hand_wins_a_tie_against_an_unscored_one(self):
        # Neither is better on the evidence, and only one of them brought any.
        old = {"hand_name": "Flush"}
        new = {"hand_name": "Flush", "score": [5, 9, 7, 5, 4, 2]}
        self.assertEqual(best_of([old, new]), new)

    def test_nothing_shown_down_is_no_best_hand(self):
        self.assertIsNone(best_of([]))


class SideBetStakeTests(CoordinatorHarness, TestCase):
    """What a call costs, what it pays, and what happens when it cannot be paid."""

    def _hand_in_progress(self, players=3):
        coordinator = self._build_coordinator(
            [self._record(index, table_number=1, seat_at_table=index) for index in range(players)],
            players_per_table=players,
        )
        self._sync_and_rebalance(coordinator)
        coordinator._open_side_bets(coordinator._tables[1])
        return coordinator

    def _fold(self, coordinator, user_id):
        coordinator._players_by_user_id[user_id].is_folded = True

    def _results(self):
        return [
            payload for _table, event, payload in self.table_events
            if event == "side_bet_results"
        ][-1]["results"]

    def test_the_stake_leaves_the_wallet_when_the_call_is_made(self):
        coordinator = self._hand_in_progress()
        self._fold(coordinator, 100)

        async_to_sync(coordinator.place_side_bet)(100, 101, 50)

        self.assertEqual(self.coins[100], 950)

    def test_the_odds_are_how_many_were_still_in_when_you_called(self):
        coordinator = self._hand_in_progress(players=3)
        self._fold(coordinator, 100)

        async_to_sync(coordinator.place_side_bet)(100, 101, 50)

        bet = coordinator.side_bets_at(1)["bets"][0]
        # Two left of the three dealt in, so a right call doubles the stake.
        self.assertEqual(bet["odds"], 2)
        self.assertEqual(bet["returns"], 100)

    def test_a_right_call_pays_the_odds(self):
        coordinator = self._hand_in_progress()
        self._fold(coordinator, 100)
        async_to_sync(coordinator.place_side_bet)(100, 101, 50)

        async_to_sync(coordinator._hand_event)(1, "pot_awarded", [{"seat": 1, "amount": 60}])

        # 1000 - 50 staked, + 100 back.
        self.assertEqual(self.coins[100], 1050)
        self.assertEqual(self._results()[0]["balance"], 1050)

    def test_a_wrong_call_keeps_nothing(self):
        coordinator = self._hand_in_progress()
        self._fold(coordinator, 100)
        async_to_sync(coordinator.place_side_bet)(100, 101, 50)

        async_to_sync(coordinator._hand_event)(1, "pot_awarded", [{"seat": 2, "amount": 60}])

        self.assertEqual(self.coins[100], 950)
        # Still told what it left them with, which is the number they want.
        self.assertEqual(self._results()[0]["balance"], 950)

    def test_a_wallet_that_cannot_cover_it_makes_no_call(self):
        coordinator = self._hand_in_progress()
        self._fold(coordinator, 100)
        self.coins[100] = 10

        self.assertFalse(async_to_sync(coordinator.place_side_bet)(100, 101, 500))
        self.assertEqual(coordinator.side_bets_at(1)["bets"], [])
        self.assertEqual(self.coins[100], 10)

    def test_a_stake_outside_the_limits_is_refused_rather_than_trimmed(self):
        coordinator = self._hand_in_progress()
        self._fold(coordinator, 100)

        # Silently charging 500 for a request to bet 9,000 is charging somebody
        # something they did not agree to.
        self.assertFalse(async_to_sync(coordinator.place_side_bet)(100, 101, 9000))
        self.assertFalse(async_to_sync(coordinator.place_side_bet)(100, 101, 0))
        # The wallet was never even opened: the stake is judged before anybody
        # is charged anything.
        self.assertNotIn(100, self.coins)

    def test_the_last_two_standing_cannot_be_called_by_the_third(self):
        # Heads-up with one folded player watching is still a call worth making;
        # a single player left is not a question.
        coordinator = self._hand_in_progress(players=3)
        self._fold(coordinator, 100)
        self._fold(coordinator, 101)

        self.assertFalse(async_to_sync(coordinator.place_side_bet)(100, 102, 50))


class ThrowableOwnershipTests(TransactionTestCase):
	"""A priced throwable cannot be thrown by somebody who has not bought it."""

	def _throw(self, user, item):
		from game.consumers import _tournament_runners

		class Player:
			def __init__(self, seat, table_number, name):
				self._seat = seat
				self._table_number = table_number
				self.name = name

		class Runner:
			def get_runtime_player(self, user_id):
				return Player(0 if user_id == user.id else 3, 1, f"p{user_id}")

		sent = []

		async def capture(tid, table, event_type, data):
			sent.append((event_type, data))

		consumer = TournamentConsumer()
		consumer.tournament_id = 9911
		consumer.user = user
		consumer.shown_name = user.username

		_tournament_runners[9911] = Runner()
		with patch("game.consumers._broadcast_table", capture):
			async_to_sync(consumer._throw_item)({"item": item, "at_user_id": user.id + 1})
		_tournament_runners.pop(9911, None)
		return sent

	def setUp(self):
		self.user = get_user_model().objects.create_user(username="thrower", password="secret123")

	def test_a_free_one_needs_nothing(self):
		self.assertEqual(len(self._throw(self.user, "tomato")), 1)

	def test_a_priced_one_that_was_never_bought_goes_nowhere(self):
		self.assertEqual(self._throw(self.user, "bomb"), [])

	def test_and_lands_once_it_has_been(self):
		from sidegames.shop import buy_throwable

		buy_throwable(self.user, "bomb")

		sent = self._throw(self.user, "bomb")
		self.assertEqual(len(sent), 1)
		self.assertEqual(sent[0][1]["item"], "bomb")


class OutsTests(TestCase):
	"""What a player behind is drawing to, beside the percentage.

	A percentage says how likely; it does not say what you are waiting for. The
	point of computing these against the evaluator rather than counting a suit
	is that a card can complete your draw and still lose.
	"""

	def _cards(self, *pairs):
		ranks = {
			"2": Rank.TWO, "3": Rank.THREE, "4": Rank.FOUR, "5": Rank.FIVE, "6": Rank.SIX,
			"7": Rank.SEVEN, "8": Rank.EIGHT, "9": Rank.NINE, "T": Rank.TEN, "J": Rank.JACK,
			"Q": Rank.QUEEN, "K": Rank.KING, "A": Rank.ACE,
		}
		suits = {"h": Suit.HEARTS, "d": Suit.DIAMONDS, "c": Suit.CLUBS, "s": Suit.SPADES}
		return [Card(ranks[text[0]], suits[text[1]]) for text in pairs]

	def _outs(self, hero, villain, board):
		from .engine.hand import _outs

		return [
			[str(card) for card in one]
			for one in _outs([self._cards(*hero), self._cards(*villain)], self._cards(*board))
		]

	def test_a_flush_draw_counts_only_the_cards_that_actually_win(self):
		"""Nine hearts left, but one of them fills the other hand up. Counting
		the suit would promise a card that loses the pot."""
		hero, villain = self._outs(["Ah", "Kh"], ["9s", "9c"], ["2h", "7h", "9d"])

		self.assertEqual(hero, ["3♥", "4♥", "5♥", "6♥", "8♥", "T♥", "J♥", "Q♥"])
		# The nine of hearts is the flush card that gives them quads instead.
		self.assertNotIn("9♥", hero)
		# And the hand in front is not drawing to anything.
		self.assertEqual(villain, [])

	def test_a_chop_counts_as_getting_there(self):
		"""Half the pot back, from a hand that was losing, is a card you are
		rooting for."""
		hero, _ = self._outs(["Ac", "2d"], ["Ad", "3c"], ["Ah", "Ks", "7h"])

		# Any king, seven or three pairs the board high enough to play it, and
		# the kickers stop mattering.
		self.assertIn("K♥", hero)

	def test_nobody_is_drawing_before_the_flop(self):
		"""Two cards to come is not an out, whatever anybody says at the table."""
		hero, villain = self._outs(["Ah", "Kh"], ["9s", "9c"], [])

		self.assertEqual(hero, [])
		self.assertEqual(villain, [])

	def test_nothing_is_coming_after_the_river(self):
		hero, villain = self._outs(["Ah", "Kh"], ["9s", "9c"], ["2h", "7h", "9d", "4s", "Jc"])

		self.assertEqual(hero, [])
		self.assertEqual(villain, [])

	def test_a_hand_level_at_the_top_is_not_behind(self):
		"""Playing the same board is not losing, and there is nothing to draw
		to when the pot is already going to be split."""
		hero, villain = self._outs(["2c", "3d"], ["2h", "3s"], ["As", "Ks", "Qd"])

		self.assertEqual(hero, [])
		self.assertEqual(villain, [])


class FastPayloadTests(TestCase):
    """What the table is told it is dealing."""

    def test_a_tournament_is_not_a_fast_game(self):
        tournament = Tournament.objects.create(
            host=User.objects.create_user(username="sp_host", password="x"),
            name="Thursday", buy_in_coins=50,
        )
        self.assertIsNone(fast_payload(tournament))

    def test_a_spin_n_go_carries_the_stake_the_multiplier_and_the_prize(self):
        tournament = Tournament.objects.create(
            host=User.objects.create_user(username="sp_host2", password="x"),
            name="Spin n Go", format="spingo", buy_in_coins=25, spin_multiplier=10,
            players_per_table=3,
        )
        self.assertEqual(fast_payload(tournament), {
            "key": "spingo", "label": "Spin n Go", "seats": 3,
            "stake_coins": 25, "multiplier": 10, "prize_coins": 250,
        })

    def test_a_heads_up_carries_its_two_seats_and_the_buy_ins(self):
        """The felt reads `seats` to know which table to lay.

        Two seats is a different room from three, and the client cannot work it
        out from the players — half of them may not have connected yet.
        """
        tournament = Tournament.objects.create(
            host=User.objects.create_user(username="sp_host3", password="x"),
            name="Heads Up", format="sitngo", buy_in_coins=50,
            max_players=2, players_per_table=2,
        )
        self.assertEqual(fast_payload(tournament), {
            "key": "hu", "label": "Heads Up", "seats": 2,
            "stake_coins": 50, "multiplier": 0, "prize_coins": 100,
        })


class FastGameLiveTests(TransactionTestCase):
    """A whole fast game, played over the socket, coins in and coins out.

    The tests that go all the way through: the engine boots off the first
    connect, the stacks play it out, and the wallets are checked afterwards.
    Everything else about these formats is arithmetic somewhere with a test of
    its own — this is the wiring between them, which is the part unit tests
    cannot say anything about.
    """

    def tearDown(self):
        _tournament_runners.clear()
        _game_tasks.clear()

    def _setup_game(self, key, stake, multiplier=0):
        from sidegames.economy import spend, wallet_for
        from sidegames.models import Wallet
        from tournaments import fastgames
        from tournaments.models import BlindLevel

        fmt = fastgames.FORMATS[key]
        users = []
        for index in range(fmt.seats):
            user = User.objects.create_user(username=f"live_{key}_{index}", password="x")
            wallet_for(user)
            Wallet.objects.filter(user=user).update(balance=stake * 4)
            users.append(user)

        # Fired, as the sit endpoint leaves it: running, with the draw already
        # made where the format has one.
        game = Tournament.objects.create(
            host=users[0],
            **{**fastgames.tournament_defaults(fmt, stake),
               "status": "running", "spin_multiplier": multiplier},
        )
        BlindLevel.objects.bulk_create([
            BlindLevel(tournament=game, **row) for row in fastgames.level_rows(fmt)
        ])
        table = game.ensure_table(1)
        for index, user in enumerate(users):
            TournamentPlayer.objects.create(
                tournament=game, user=user, table=table, seat=index, seat_at_table=index,
                chips=game.starting_chips, time_bank_seconds_remaining=game.time_bank_seconds,
            )
            spend(user, stake, "stake", memo=f"tournament:{game.id}")
        return game, users

    async def _play_it_out(self, game, users, timeout=120):
        comms = []
        for user in users:
            communicator = WebsocketCommunicator(
                TournamentConsumer.as_asgi(), f"/ws/tournament/{game.id}/",
            )
            communicator.scope["user"] = user
            communicator.scope["url_route"] = {"kwargs": {"tournament_id": str(game.id)}}
            connected, _ = await communicator.connect(timeout=5)
            self.assertTrue(connected, f"{user.username} could not connect")
            comms.append(communicator)

        # Everybody ready, so the countdown ends without waiting it out.
        for communicator in comms:
            await communicator.send_json_to({"type": "ready", "value": True})

        seen_spin = {}
        complete = None
        loop = asyncio.get_event_loop()
        deadline = loop.time() + timeout
        while complete is None and loop.time() < deadline:
            for communicator in comms:
                if await communicator.receive_nothing(timeout=0.05):
                    continue
                message = await communicator.receive_json_from()
                kind = message.get("type")
                if kind in ("tournament_started", "game_state") and message.get("fast"):
                    seen_spin.update(message["fast"])
                if kind == "action_required":
                    valid = message.get("valid_actions") or []
                    # Shove whenever it is legal. Fifteen blinds three-handed is
                    # a format that ends this way anyway, and it gets the test to
                    # the payout in a handful of hands.
                    action = "raise" if "raise" in valid else (
                        "call" if "call" in valid else "check"
                    )
                    await communicator.send_json_to({
                        "type": "player_action",
                        "action": action,
                        "amount": message.get("max_raise", 0),
                    })
                if kind == "tournament_complete":
                    complete = message
                    break

        for communicator in comms:
            await communicator.disconnect()
        return complete, seen_spin

    def test_a_spin_n_go_plays_out_and_pays_the_winner_in_coins(self):
        from sidegames.models import CoinLedger, Wallet

        game, users = self._setup_game("spingo", 25, multiplier=2)
        complete, seen = async_to_sync(self._play_it_out)(game, users)

        self.assertIsNotNone(complete, "the game never finished")
        # The draw reached the table, which is the only place it is ever shown.
        self.assertEqual(seen.get("key"), "spingo")
        self.assertEqual(seen.get("multiplier"), 2)
        self.assertEqual(seen.get("prize_coins"), 50)

        game.refresh_from_db()
        self.assertEqual(game.status, "finished")
        winner = game.players.get(finish_position=1)
        payouts = CoinLedger.objects.filter(reason="payout", memo=f"tournament:{game.id}")
        self.assertEqual([row.amount for row in payouts], [50])
        self.assertEqual(payouts.first().user_id, winner.user_id)
        # A hundred to start, twenty-five to sit, fifty for winning it.
        self.assertEqual(Wallet.objects.get(user_id=winner.user_id).balance, 125)

    def test_a_heads_up_sit_n_go_plays_out_between_two_seats(self):
        """Two players is the shape the engine bends most for.

        The button posts the small blind and acts first before the flop, and last
        after it — rules that only exist heads-up. If any of that were wrong the
        hand would stall waiting on a seat that is not there, so getting to a
        finish at all is most of what this proves.
        """
        from sidegames.models import CoinLedger, Wallet

        game, users = self._setup_game("hu", 50)
        complete, seen = async_to_sync(self._play_it_out)(game, users)

        self.assertIsNotNone(complete, "the heads-up never finished")
        self.assertEqual(seen.get("key"), "hu")
        self.assertEqual(seen.get("seats"), 2)
        # No draw here: a Sit n Go pays out exactly what went in.
        self.assertEqual(seen.get("multiplier"), 0)
        self.assertEqual(seen.get("prize_coins"), 100)

        game.refresh_from_db()
        self.assertEqual(game.status, "finished")
        self.assertEqual(
            sorted(game.players.values_list("finish_position", flat=True)), [1, 2],
        )
        winner = game.players.get(finish_position=1)
        payouts = CoinLedger.objects.filter(reason="payout", memo=f"tournament:{game.id}")
        self.assertEqual([row.amount for row in payouts], [100])
        # Two hundred to start, fifty to sit, the whole hundred for winning.
        self.assertEqual(Wallet.objects.get(user_id=winner.user_id).balance, 250)
        loser = game.players.exclude(finish_position=1).get()
        self.assertEqual(Wallet.objects.get(user_id=loser.user_id).balance, 150)

    def test_a_six_max_sit_n_go_plays_out_and_pays_two_places(self):
        from sidegames.models import CoinLedger, Wallet

        game, users = self._setup_game("sixmax", 25)
        complete, seen = async_to_sync(self._play_it_out)(game, users, timeout=240)

        self.assertIsNotNone(complete, "the six-max never finished")
        self.assertEqual(seen.get("seats"), 6)

        game.refresh_from_db()
        self.assertEqual(game.status, "finished")
        # A hundred and fifty in, split sixty-five thirty-five: 97 and 52, with
        # the rounding remainder going to first.
        payouts = {
            row.user_id: row.amount for row in
            CoinLedger.objects.filter(reason="payout", memo=f"tournament:{game.id}")
        }
        self.assertEqual(sorted(payouts.values(), reverse=True), [98, 52])
        self.assertEqual(sum(payouts.values()), 150)
        first = game.players.get(finish_position=1)
        second = game.players.get(finish_position=2)
        self.assertEqual(payouts[first.user_id], 98)
        self.assertEqual(payouts[second.user_id], 52)
        # Everybody else paid to sit and took nothing back.
        self.assertEqual(
            Wallet.objects.get(user_id=game.players.get(finish_position=6).user_id).balance, 75,
        )


class HandHistoryNamingTests(APITestCase):
    """What the replay calls people.

    The login name is what a row is filed under; the display name is what
    somebody asked to be called. A hand history is other people talking about a
    hand you played, so it is the second one that belongs there.
    """

    def setUp(self):
        from accounts.models import Profile

        self.host = User.objects.create_user(username="hh_host", password="x")
        Profile.objects.update_or_create(user=self.host, defaults={"display_name": "The Host"})
        self.plain = User.objects.create_user(username="hh_plain", password="x")

        self.tournament = Tournament.objects.create(host=self.host, name="Replay", status="running")
        self.seats = {
            user.username: TournamentPlayer.objects.create(
                tournament=self.tournament, user=user, seat=index, seat_at_table=index, chips=1000,
            )
            for index, user in enumerate((self.host, self.plain))
        }
        self.client.force_authenticate(self.host)

    def _hand_with_actions(self):
        from game.models import Hand, HandAction

        hand = Hand.objects.create(
            tournament=self.tournament, hand_number=1, level_index=0, dealer_seat=0,
            community_cards=[], pot_total=100, result={}, status="complete",
        )
        for username, seat in (("hh_host", 0), ("hh_plain", 1)):
            HandAction.objects.create(
                hand=hand, player=self.seats[username], seat=seat,
                street="preflop", action="call", amount=50,
            )
        return hand

    def test_the_replay_carries_the_name_a_player_chose(self):
        self._hand_with_actions()

        rows = self.client.get(reverse("tournament-hands", args=[self.tournament.id])).data
        by_seat = {action["seat"]: action for action in rows[0]["actions"]}

        self.assertEqual(by_seat[0]["display_name"], "The Host")
        # Still filed under the login name, which is what everything else keys on.
        self.assertEqual(by_seat[0]["username"], "hh_host")

    def test_somebody_who_set_no_name_is_called_what_they_signed_up_as(self):
        self._hand_with_actions()

        rows = self.client.get(reverse("tournament-hands", args=[self.tournament.id])).data
        by_seat = {action["seat"]: action for action in rows[0]["actions"]}

        self.assertEqual(by_seat[1]["display_name"], "hh_plain")

    def test_one_hand_read_on_its_own_is_named_the_same_way(self):
        hand = self._hand_with_actions()

        detail = self.client.get(reverse("hand-detail", args=[hand.id])).data

        self.assertEqual(
            {action["display_name"] for action in detail["actions"]},
            {"The Host", "hh_plain"},
        )


class BountyLiveTests(TransactionTestCase):
    """Whole knockout tournaments, played over the socket, settled at the end.

    The bounty arithmetic has unit tests either side of it — the split, the
    ledger, the coordinator — and this is the wiring between them: real hands,
    real busts, real splits when two people bust somebody at once, and then the
    settlement that pays for it. What it checks is that every cent the buy-ins
    put up comes back out again.
    """

    def tearDown(self):
        _tournament_runners.clear()
        _game_tasks.clear()

    def _setup(self, *, bounty_mode, bounty_cents=1000, players=4, **extra):
        from tournaments.models import BlindLevel

        users = [
            User.objects.create_user(username=f"ko_{bounty_mode}_{index}", password="x")
            for index in range(players)
        ]
        tournament = Tournament.objects.create(
            host=users[0], name=f"{bounty_mode} night", status="running",
            starting_chips=1000, buy_in_cents=2000,
            bounty_mode=bounty_mode, bounty_cents=bounty_cents,
            max_players=players, players_per_table=players,
            late_reg_level=0, allow_rebuys=False, max_rebuys=0, rebuy_level=0,
            time_bank_seconds=5, showdown_seconds=2,
            payout_structure=[
                {"place": 1, "label": "1st", "percentage": 70},
                {"place": 2, "label": "2nd", "percentage": 30},
            ],
            **extra,
        )
        # Blinds high enough against the stacks that the thing ends in a
        # handful of hands rather than in real time.
        BlindLevel.objects.bulk_create([
            BlindLevel(
                tournament=tournament, level_number=index + 1, is_break=False,
                small_blind=sb, big_blind=bb, ante=0, duration_minutes=2,
            )
            for index, (sb, bb) in enumerate(((50, 100), (150, 300), (400, 800), (1000, 2000)))
        ])
        table = tournament.ensure_table(1)
        starting_bounty = bounty_cents if bounty_mode in ("fixed", "progressive") else 0
        for index, user in enumerate(users):
            TournamentPlayer.objects.create(
                tournament=tournament, user=user, table=table, seat=index, seat_at_table=index,
                chips=tournament.starting_chips, time_bank_seconds_remaining=5,
                bounty_cents=starting_bounty,
            )
        return tournament, users

    async def _play_it_out(self, tournament, users, timeout=180):
        comms = []
        for user in users:
            communicator = WebsocketCommunicator(
                TournamentConsumer.as_asgi(), f"/ws/tournament/{tournament.id}/",
            )
            communicator.scope["user"] = user
            communicator.scope["url_route"] = {"kwargs": {"tournament_id": str(tournament.id)}}
            connected, _ = await communicator.connect(timeout=5)
            self.assertTrue(connected, f"{user.username} could not connect")
            comms.append(communicator)

        for communicator in comms:
            await communicator.send_json_to({"type": "ready", "value": True})

        seen = {"bounty_won": [], "mystery_opened": [], "mystery_sealed": []}
        complete = None
        loop = asyncio.get_event_loop()
        deadline = loop.time() + timeout
        while complete is None and loop.time() < deadline:
            for communicator in comms:
                if await communicator.receive_nothing(timeout=0.05):
                    continue
                message = await communicator.receive_json_from()
                kind = message.get("type")
                if kind in seen:
                    seen[kind].append(message)
                if kind == "action_required":
                    valid = message.get("valid_actions") or []
                    # Everybody shoves, so the busts come thick and fast — and
                    # so split pots happen, which is the case worth catching.
                    action = "raise" if "raise" in valid else (
                        "call" if "call" in valid else "check"
                    )
                    await communicator.send_json_to({
                        "type": "player_action",
                        "action": action,
                        "amount": message.get("max_raise", 0),
                    })
                if kind == "tournament_complete":
                    complete = message
                    break

        for communicator in comms:
            await communicator.disconnect()
        return complete, seen

    def _settled(self, tournament):
        from tournaments.models import LedgerEntry

        return list(LedgerEntry.objects.filter(tournament=tournament).select_related("user"))

    def test_a_progressive_knockout_tournament_pays_out_every_cent_it_took(self):
        tournament, users = self._setup(bounty_mode="progressive")
        complete, seen = async_to_sync(self._play_it_out)(tournament, users)

        self.assertIsNotNone(complete, "the tournament never finished")
        self.assertTrue(seen["bounty_won"], "nobody ever collected a bounty")

        tournament.refresh_from_db()
        self.assertEqual(tournament.status, "finished")
        entries = self._settled(tournament)
        self.assertEqual(len(entries), len(users))

        # Every buy-in, and every part of every buy-in, accounted for.
        self.assertEqual(sum(e.stake_cents for e in entries), 2000 * len(users))
        self.assertEqual(sum(e.bounty_prize_cents for e in entries), 1000 * len(users))
        self.assertEqual(sum(e.prize_cents for e in entries), 2000 * len(users))
        # Nobody was paid a negative amount out of somebody else's pocket.
        self.assertTrue(all(e.prize_cents >= 0 for e in entries))

    def test_a_fixed_knockout_tournament_pays_out_every_cent_it_took(self):
        tournament, users = self._setup(bounty_mode="fixed")
        complete, _ = async_to_sync(self._play_it_out)(tournament, users)

        self.assertIsNotNone(complete, "the tournament never finished")
        entries = self._settled(tournament)
        self.assertEqual(sum(e.bounty_prize_cents for e in entries), 1000 * len(users))
        self.assertEqual(sum(e.prize_cents for e in entries), 2000 * len(users))

    def test_a_mystery_tournament_opens_its_envelopes_and_pays_them_all_out(self):
        """Registration is closed from level one here, so they open on the
        first hand that busts somebody — which is the rule under test."""
        tournament, users = self._setup(
            bounty_mode="mystery", mystery_release="reg_closed",
        )
        complete, seen = async_to_sync(self._play_it_out)(tournament, users)

        self.assertIsNotNone(complete, "the tournament never finished")
        self.assertTrue(seen["mystery_opened"], "the envelopes never opened")

        opened = seen["mystery_opened"][0]
        # One envelope per knockout still to come, and the pool is every
        # buy-in's bounty.
        self.assertEqual(opened["pool_cents"], 1000 * len(users))
        self.assertEqual(len(opened["envelopes"]), opened["players_left"] - 1)

        tournament.refresh_from_db()
        entries = self._settled(tournament)
        # Whatever was drawn, plus whatever was left sealed, is the pool.
        self.assertEqual(sum(e.bounty_prize_cents for e in entries), 1000 * len(users))
        self.assertEqual(sum(e.prize_cents for e in entries), 2000 * len(users))
        # And every envelope that was drawn came off the board.
        drawn = [message for message in seen["bounty_won"] if message.get("mystery")]
        self.assertEqual(
            len(opened["envelopes"]) - len(tournament.mystery_envelopes),
            len({(m["victim_name"], m["mystery"]["envelopes_left"]) for m in drawn}),
        )


class ThrowLimitTests(TestCase):
    """Three in a row is a joke; ten in a row is a way of stopping somebody
    playing. The difference is entirely a question of rate."""

    def test_a_burst_of_three_is_allowed(self):
        from game.throwlimit import BURST, check

        kept, now = [], 100.0
        for index in range(BURST):
            allowed, kept, cooling = check(kept, now + index * 0.5)
            self.assertTrue(allowed, index)
            self.assertEqual(cooling, 0)

    def test_the_fourth_in_a_row_is_refused_with_the_wait(self):
        from game.throwlimit import COOLDOWN_SECONDS, check

        kept = []
        for index in range(3):
            _, kept, _ = check(kept, 100.0 + index * 0.5)

        allowed, kept, cooling = check(kept, 101.5)
        self.assertFalse(allowed)
        # The clock runs from the throw that spent the burst, not from now.
        self.assertAlmostEqual(cooling, COOLDOWN_SECONDS - 0.5, places=2)

    def test_leaning_on_the_button_does_not_push_the_wait_further_out(self):
        """A refused throw is not recorded. Otherwise impatience would be
        punished harder than the spam the rule is for."""
        from game.throwlimit import COOLDOWN_SECONDS, check

        kept = []
        for index in range(3):
            _, kept, _ = check(kept, 100.0 + index * 0.5)

        for attempt in range(20):
            allowed, kept, cooling = check(kept, 102.0 + attempt * 0.1)
            self.assertFalse(allowed)

        # Ten seconds after the third throw, and not a moment later.
        allowed, _, _ = check(kept, 101.0 + COOLDOWN_SECONDS)
        self.assertTrue(allowed)

    def test_three_spread_over_a_minute_is_a_table_having_fun(self):
        from game.throwlimit import check

        kept = []
        for index in range(6):
            allowed, kept, _ = check(kept, 100.0 + index * 20)
            self.assertTrue(allowed, index)

    def test_the_wait_ends_and_the_next_burst_starts_clean(self):
        from game.throwlimit import BURST, COOLDOWN_SECONDS, check

        kept = []
        for index in range(BURST):
            _, kept, _ = check(kept, 100.0 + index * 0.5)

        after = 101.0 + COOLDOWN_SECONDS
        allowed, kept, cooling = check(kept, after)
        self.assertTrue(allowed)
        self.assertEqual(cooling, 0)
        # And a whole fresh burst behind it: what happened before the wait is
        # history rather than credit against the next three.
        for index in range(1, BURST):
            allowed, kept, _ = check(kept, after + index * 0.3)
            self.assertTrue(allowed, index)
        self.assertFalse(check(kept, after + 1.5)[0])

    def test_nothing_thrown_yet_is_always_allowed(self):
        from game.throwlimit import check

        allowed, kept, cooling = check([], 500.0)
        self.assertTrue(allowed)
        self.assertEqual(kept, [500.0])
        self.assertEqual(cooling, 0)


class AwayTests(TestCase):
    """Disconnected means gone, not "looking at something else"."""

    def test_a_player_who_closed_the_app_is_gone(self):
        from game.away import truly_gone

        self.assertTrue(truly_gone(app_open=False, other_tables=False))

    def test_walking_over_to_the_lobby_is_not_being_disconnected(self):
        """The seat lit up DISCONNECTED for somebody who was in the app the
        whole time, reading the lobby."""
        from game.away import truly_gone

        self.assertFalse(truly_gone(app_open=True, other_tables=False))

    def test_playing_another_table_is_not_being_disconnected_at_this_one(self):
        from game.away import truly_gone

        # The app allows several at once, and switching between two of your own
        # used to mark you gone at whichever you were not looking at.
        self.assertFalse(truly_gone(app_open=False, other_tables=True))
        self.assertFalse(truly_gone(app_open=True, other_tables=True))

    def test_only_the_seat_of_somebody_actually_gone_says_anything(self):
        from game.away import label_for

        self.assertIsNone(label_for(app_open=True, at_this_table=True))
        self.assertIsNone(label_for(app_open=False, at_this_table=True))
        # In the app, elsewhere: their clock says it better than a badge would.
        self.assertIsNone(label_for(app_open=True, at_this_table=False))
        self.assertEqual(label_for(app_open=False, at_this_table=False), "disconnected")


class GoneOrJustElsewhereTests(TransactionTestCase):
    """What the table is told when a player's table socket closes.

    The registries here are the real ones — one process, by design — so these
    drive them directly rather than opening sockets: what is being checked is
    the decision, not the plumbing under it.
    """

    def setUp(self):
        from accounts import presence
        from game.consumers import _player_channels, _tournament_runners

        presence._socket_counts.clear()
        _player_channels.clear()
        _tournament_runners.clear()
        self.told = []

    def tearDown(self):
        from accounts import presence
        from game.consumers import _player_channels, _tournament_runners

        presence._socket_counts.clear()
        _player_channels.clear()
        _tournament_runners.clear()

    def _runner(self, user_id=7, seat=2, table=1):
        class Player:
            _seat = seat
            _table_number = table
            name = "ana"

        class Runner:
            def get_runtime_player(self, uid):
                return Player() if uid == user_id else None

        return Runner()

    async def _capture(self, tournament_id, table_number, event_type, data):
        self.told.append((tournament_id, event_type, data))

    def test_closing_a_table_while_the_app_is_open_says_nothing(self):
        """Walking to the lobby is not a disconnection, and the seat used to
        light up DISCONNECTED for somebody who never left."""
        from game.away import truly_gone

        self.assertFalse(truly_gone(app_open=True, other_tables=False))

    def test_the_app_closing_tells_every_table_they_are_sitting_at(self):
        from game.consumers import _tournament_runners, announce_gone

        _tournament_runners[11] = self._runner()
        _tournament_runners[12] = self._runner()

        with patch("game.consumers._broadcast_table", self._capture):
            told = async_to_sync(announce_gone)(7)

        self.assertEqual(told, 2)
        self.assertEqual({event for _tid, event, _data in self.told}, {"player_disconnected"})
        self.assertEqual({tid for tid, _event, _data in self.told}, {11, 12})

    def test_a_table_they_are_still_sitting_at_is_not_told(self):
        """Their socket there is open: whatever the app is doing, they are at
        that table."""
        from game.consumers import _player_channels, _tournament_runners, announce_gone

        _tournament_runners[11] = self._runner()
        _tournament_runners[12] = self._runner()
        _player_channels[(12, 7)] = "still-open"

        with patch("game.consumers._broadcast_table", self._capture):
            told = async_to_sync(announce_gone)(7)

        self.assertEqual(told, 1)
        self.assertEqual(self.told[0][0], 11)

    def test_nothing_is_announced_while_the_app_is_still_open(self):
        from accounts import presence
        from game.consumers import _tournament_runners, announce_gone

        _tournament_runners[11] = self._runner()
        presence.arrived(7)

        with patch("game.consumers._broadcast_table", self._capture):
            told = async_to_sync(announce_gone)(7)

        self.assertEqual(told, 0)
        self.assertEqual(self.told, [])

    def test_somebody_who_is_not_seated_anywhere_is_nobody_s_news(self):
        from game.consumers import _tournament_runners, announce_gone

        _tournament_runners[11] = self._runner(user_id=7)

        with patch("game.consumers._broadcast_table", self._capture):
            told = async_to_sync(announce_gone)(999)

        self.assertEqual(told, 0)


class AllInOrFoldTests(TestCase):
    """Push or fold: a raise may only ever be the whole stack."""

    def _decisions(self, chips, *, all_in_or_fold, answer=("fold", 0)):
        """Run one hand and collect what each player was offered."""
        from game.engine.hand import HandEngine
        from game.engine.player import Player

        offers = []
        players = [Player(name=f"p{index}", chips=amount) for index, amount in enumerate(chips)]
        for index, player in enumerate(players):
            player._seat = index

        async def request_action(player, context):
            offers.append(dict(context))
            # A callable answer can play differently depending on what it is
            # facing, which is the only way to get somebody to call a shove
            # with chips left behind — the shape of the bug below.
            return answer(context) if callable(answer) else answer

        async def broadcast(event_type, payload):
            return None

        engine = HandEngine(
            players=players, dealer_pos=0, small_blind=50, big_blind=100, ante=0,
            hand_number=1, broadcast=broadcast, request_action=request_action,
            all_in_or_fold=all_in_or_fold,
        )
        async_to_sync(engine.run)()
        return offers

    def test_the_only_raise_on_offer_is_the_whole_stack(self):
        offers = self._decisions([1500, 1500, 1500, 1500], all_in_or_fold=True)

        self.assertTrue(offers)
        for offer in offers:
            if "raise" in offer["valid_actions"]:
                self.assertEqual(
                    offer["min_raise"], offer["max_raise"],
                    "a raise smaller than the stack was on offer",
                )

    def test_an_ordinary_hand_still_offers_a_range(self):
        offers = self._decisions([1500, 1500, 1500, 1500], all_in_or_fold=False)

        raises = [one for one in offers if "raise" in one["valid_actions"]]
        self.assertTrue(raises)
        self.assertTrue(
            any(one["min_raise"] < one["max_raise"] for one in raises),
            "the ordinary game lost its raise range",
        )

    def test_folding_is_always_on_offer(self):
        for offer in self._decisions([1500, 1500, 1500, 1500], all_in_or_fold=True):
            self.assertIn("fold", offer["valid_actions"])

    def test_nobody_is_offered_a_limp(self):
        """Calling the big blind is a limp, a limp is a flop with a hundred
        chips in it, and this format has no flop. Calling is on offer facing a
        shove and nowhere else."""
        offers = self._decisions([1500, 1500, 1500, 1500], all_in_or_fold=True)

        unopened = [one for one in offers if one["to_call"] == 100 and one["street"] == "preflop"]
        self.assertTrue(unopened, "nobody was ever facing just the blind")
        for offer in unopened:
            self.assertNotIn("call", offer["valid_actions"])

    def test_calling_a_shove_is_on_offer(self):
        offers = self._decisions(
            [1500, 1500, 1500, 1500], all_in_or_fold=True, answer=("raise", 1500),
        )

        facing = [one for one in offers if one["to_call"] > 100]
        self.assertTrue(facing, "nobody was ever facing a shove")
        for offer in facing:
            self.assertIn("call", offer["valid_actions"])

    def test_the_ordinary_game_keeps_its_limp(self):
        offers = self._decisions([1500, 1500, 1500, 1500], all_in_or_fold=False)

        unopened = [one for one in offers if one["to_call"] == 100]
        self.assertTrue(unopened)
        self.assertIn("call", unopened[0]["valid_actions"])

    # Shove when nothing is in front of you, call when there is. With unequal
    # stacks that leaves the callers with chips behind, which is the state the
    # bug lived in.
    @staticmethod
    def _shove_or_call(context):
        return ("call", 0) if context["to_call"] > 100 else ("raise", 99999)

    def test_a_hand_never_reaches_a_betting_round_after_the_flop(self):
        """The bug this was written for. The short stack shoves, two deeper
        players call and both still have chips: nobody is all in, so the engine
        saw an ordinary hand and dealt a flop with a betting round on it — in a
        game whose name says there is no such thing."""
        offers = self._decisions(
            # Seat 3 acts first at four-handed, so that is the short stack.
            [1500, 1500, 1500, 1000], all_in_or_fold=True, answer=self._shove_or_call,
        )

        called = [one for one in offers if one["to_call"] > 100]
        self.assertTrue(called, "nobody called a shove, so this proves nothing")
        after_preflop = [one for one in offers if one["street"] != "preflop"]
        self.assertEqual(
            after_preflop, [], "somebody was asked to act after the flop",
        )

    def test_the_ordinary_game_still_plays_a_flop(self):
        offers = self._decisions(
            [1500, 1500, 1500, 1000], all_in_or_fold=False, answer=self._shove_or_call,
        )

        self.assertTrue(
            [one for one in offers if one["street"] != "preflop"],
            "the ordinary game lost its postflop betting",
        )

    def test_a_shove_is_clamped_to_the_stack_whatever_the_client_asks_for(self):
        """The number arrives over a socket, so it is not believed — a raise to
        four hundred in a push-or-fold game is a shove or it is nothing."""
        offers = self._decisions(
            [1500, 1500, 1500, 1500], all_in_or_fold=True, answer=("raise", 400),
        )

        first = offers[0]
        self.assertEqual(first["min_raise"], first["max_raise"])


class MultipleBoardTests(TestCase):
    """Two boards: a bomb pot from the start, or a hand run twice at the end."""

    def _hand(self, chips, *, run_it_twice=False, bomb_pot_ante=0, wants="call"):
        """One hand, with everybody answering the same way.

        `wants` is what each player tries to do; what they are actually offered
        decides the rest. Asking for a raise you cannot make and being folded
        for it is what the engine does with any illegal action, and it is not
        what these tests are about.
        """
        from game.engine.hand import HandEngine
        from game.engine.player import Player

        events = []
        players = [Player(name=f"p{index}", chips=amount) for index, amount in enumerate(chips)]
        for index, player in enumerate(players):
            player._seat = index

        async def request_action(player, context):
            valid = context["valid_actions"]
            if wants in valid:
                return (wants, context["max_raise"] if wants == "raise" else 0)
            if "call" in valid:
                return ("call", 0)
            return ("check", 0) if "check" in valid else ("fold", 0)

        async def broadcast(event_type, payload):
            events.append((event_type, payload))

        engine = HandEngine(
            players=players, dealer_pos=0, small_blind=50, big_blind=100, ante=0,
            hand_number=1, broadcast=broadcast, request_action=request_action,
            run_it_twice=run_it_twice, bomb_pot_ante=bomb_pot_ante,
        )
        result = async_to_sync(engine.run)()
        return engine, result, events

    def test_an_ordinary_hand_still_has_one_board(self):
        engine, result, _ = self._hand([2000, 2000, 2000])

        self.assertEqual(len(engine.boards), 1)
        self.assertEqual(len(result.boards), 1)
        self.assertFalse(engine.runs_twice)

    def test_a_bomb_pot_deals_two_boards_and_no_preflop_betting(self):
        asked = []

        from game.engine.hand import HandEngine
        from game.engine.player import Player

        players = [Player(name=f"p{i}", chips=2000) for i in range(3)]
        for index, player in enumerate(players):
            player._seat = index

        async def request_action(player, context):
            asked.append(context["street"])
            return ("check", 0)

        async def broadcast(event_type, payload):
            return None

        engine = HandEngine(
            players=players, dealer_pos=0, small_blind=50, big_blind=100, ante=0,
            hand_number=1, broadcast=broadcast, request_action=request_action,
            bomb_pot_ante=200,
        )
        async_to_sync(engine.run)()

        self.assertEqual(len(engine.boards), 2)
        # Nobody was asked to act before the flop: the ante was the action.
        self.assertNotIn("preflop", asked)
        # And everybody paid it: three antes of 200 in, and every chip still
        # accounted for once the two boards have been settled.
        for player in players:
            self.assertEqual(player.total_invested, 200)
        self.assertEqual(sum(player.chips for player in players), 6000)

    def test_the_two_boards_never_share_a_card(self):
        """Off the same deck. A second board that could repeat the first is a
        second chance at it rather than a second run-out."""
        engine, _result, _ = self._hand([2000, 2000, 2000], bomb_pot_ante=200)

        first, second = engine.boards
        self.assertEqual(len(first), 5)
        self.assertEqual(len(second), 5)
        self.assertEqual(len(set(map(str, first)) & set(map(str, second))), 0)

    def test_running_it_twice_splits_the_pot_in_half(self):
        """Two half pots rather than one pot decided twice: somebody who wins
        one board and loses the other gets their money back."""
        engine, result, _ = self._hand([1000, 1000], run_it_twice=True, wants="raise")

        self.assertTrue(engine.runs_twice)
        total = sum(amount for _player, amount, _desc in result.pot_awards)
        self.assertEqual(total, 2000)
        # Each board carried half of it — with the odd chip, if there was one,
        # on the first.
        by_board = {}
        for _player, amount, desc in result.pot_awards:
            board = 1 if "board 1" in desc else 2 if "board 2" in desc else 0
            by_board[board] = by_board.get(board, 0) + amount
        self.assertEqual(sorted(by_board), [1, 2])
        self.assertEqual(abs(by_board[1] - by_board[2]) <= 1, True)

    def test_it_is_not_run_twice_when_somebody_can_still_bet(self):
        """The point of it is that nothing is left to decide but the cards."""
        engine, _result, _ = self._hand([2000, 2000, 2000], run_it_twice=True, wants="check")

        self.assertFalse(engine.runs_twice)

    def test_the_chips_add_up_however_many_boards_there_were(self):
        for options in ({"bomb_pot_ante": 200}, {"run_it_twice": True}):
            with self.subTest(**options):
                engine, _result, _ = self._hand(
                    [1500, 1500, 1500], wants="raise", **options,
                )
                self.assertEqual(sum(p.chips for p in engine.players), 4500)
