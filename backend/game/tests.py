from asgiref.sync import async_to_sync
from django.test import TestCase

from .coordinator import MultiTableTournamentCoordinator


class MultiTableTournamentCoordinatorTests(TestCase):
    def _record(self, index, *, table_number=1, seat_at_table=None, chips=1000, is_eliminated=False):
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
        }

    def _build_coordinator(self, records, *, players_per_table=3):
        self.records = [dict(record) for record in records]
        self.assignments = []
        self.notifications = []
        self.tournament_events = []

        async def broadcast_tournament(event_type, payload):
            self.tournament_events.append((event_type, payload))

        async def broadcast_table(table_number, event_type, payload):
            return None

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
