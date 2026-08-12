import asyncio
import time

from asgiref.sync import async_to_sync
from django.test import TestCase

from .coordinator import MultiTableTournamentCoordinator
from .consumers import _action_queues, _request_action
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
