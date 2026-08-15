import asyncio
import random
import time
from unittest.mock import patch

from asgiref.sync import async_to_sync, sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TestCase, TransactionTestCase

from tournaments.models import Tournament, TournamentPlayer, TournamentTable

from .coordinator import MultiTableTournamentCoordinator
from .consumers import (
    CHAT_MESSAGE_BUDGET, MEDIA_MESSAGE_BUDGET, TournamentConsumer, _action_queues,
    _media_presence, _request_action,
)

User = get_user_model()
from .engine.hand import HandEngine
from .engine.player import Player


class MultiTableTournamentCoordinatorTests(TestCase):
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

    def _build_coordinator(self, records, *, players_per_table=3):
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
        )

    def _sync_and_rebalance(self, coordinator):
        async_to_sync(coordinator._sync_players_from_db)()
        async_to_sync(coordinator._rebalance_tables)()

    def test_boot_layout_creates_two_runtime_tables(self):
        coordinator = self._build_coordinator(
            [self._record(index, table_number=1, seat_at_table=index) for index in range(4)],
            players_per_table=3,
        )

        self._sync_and_rebalance(coordinator)

        self.assertEqual([table["table_number"] for table in coordinator.table_summaries()], [1, 2])
        self.assertEqual([table["player_count"] for table in coordinator.table_summaries()], [2, 2])
        self.assertEqual(self.assignments[-1]["active_table_numbers"], [1, 2])

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
