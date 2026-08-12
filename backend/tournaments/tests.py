from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from datetime import timedelta
from rest_framework import status
from rest_framework.test import APITestCase

from asgiref.sync import async_to_sync
from django.test import TestCase

from .models import Tournament, TournamentPlayer
from game.consumers import _tournament_runners
from game.coordinator import MultiTableTournamentCoordinator
from game.engine.player import Player as EnginePlayer


User = get_user_model()


class TournamentCreationTests(APITestCase):
	def setUp(self):
		self.user = User.objects.create_user(username="host", password="secret123")
		self.client.force_authenticate(self.user)

	def tearDown(self):
		_tournament_runners.clear()

	def test_create_tournament_with_frontend_config_fields(self):
		scheduled_start_at = timezone.now() + timedelta(days=1)
		response = self.client.post(
			reverse("tournament-list"),
			{
				"name": "Sunday Major",
				"scheduled_start_at": scheduled_start_at.isoformat(),
				"starting_chips": 20000,
				"max_players": 18,
				"players_per_table": 9,
				"late_reg_level": 2,
				"allow_rebuys": True,
				"max_rebuys": 3,
				"rebuy_level": 2,
				"time_bank_seconds": 30,
				"time_bank_refill_rule": "hands",
				"time_bank_refill_every_hands": 10,
				"rabbit_hunting_enabled": True,
				"auto_remove_offline_seconds": 300,
				"payout_structure": [
					{"place": 1, "label": "Winner", "percentage": 70},
					{"place": 2, "label": "Runner-up", "percentage": 30},
				],
				"levels": [
					{
						"small_blind": 25,
						"big_blind": 50,
						"ante": 0,
						"duration_minutes": 10,
					},
					{
						"is_break": True,
						"small_blind": 0,
						"big_blind": 0,
						"ante": 0,
						"duration_minutes": 5,
					},
					{
						"small_blind": 50,
						"big_blind": 100,
						"ante": 10,
						"duration_minutes": 10,
					},
				],
			},
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		tournament = Tournament.objects.get(id=response.data["id"])
		self.assertEqual(tournament.players_per_table, 9)
		self.assertEqual(tournament.max_players, 18)
		self.assertEqual(tournament.scheduled_start_at, scheduled_start_at)
		self.assertEqual(tournament.late_reg_level, 2)
		self.assertEqual(tournament.time_bank_seconds, 30)
		self.assertEqual(tournament.time_bank_refill_rule, "hands")
		self.assertEqual(tournament.time_bank_refill_every_hands, 10)
		self.assertTrue(tournament.rabbit_hunting_enabled)
		self.assertEqual(tournament.auto_remove_offline_seconds, 300)
		self.assertEqual(
			tournament.payout_structure,
			[
				{"place": 1, "label": "Winner", "percentage": 70.0},
				{"place": 2, "label": "Runner-up", "percentage": 30.0},
			],
		)
		self.assertEqual(tournament.players.count(), 1)
		self.assertEqual(tournament.tables.count(), 1)
		self.assertEqual(tournament.levels.count(), 3)
		host_seat = tournament.players.get(user=self.user)
		self.assertEqual(host_seat.table.table_number, 1)
		self.assertEqual(host_seat.seat_at_table, 0)
		self.assertEqual(host_seat.time_bank_seconds_remaining, 30)
		self.assertTrue(tournament.levels.get(level_number=2).is_break)

	def test_join_assigns_second_table_when_first_table_is_full(self):
		tournament = Tournament.objects.create(
			host=self.user,
			name="Deepstack",
			starting_chips=15000,
			max_players=18,
			players_per_table=9,
		)
		primary_table = tournament.ensure_table(1)
		tournament.players.create(user=self.user, table=primary_table, seat=0, seat_at_table=0, chips=15000)

		for seat in range(1, 9):
			user = User.objects.create_user(username=f"filled{seat}", password="secret123")
			tournament.players.create(
				user=user,
				table=primary_table,
				seat=seat,
				seat_at_table=seat,
				chips=15000,
			)

		joiner = User.objects.create_user(username="joiner", password="secret123")
		self.client.force_authenticate(joiner)

		response = self.client.post(reverse("tournament-join", kwargs={"pk": tournament.id}))

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(response.data["seat"], 9)
		self.assertEqual(response.data["table_number"], 2)
		self.assertEqual(response.data["seat_at_table"], 0)
		joined_player = tournament.players.get(user=joiner)
		self.assertEqual(joined_player.table.table_number, 2)
		self.assertEqual(joined_player.seat_at_table, 0)

	def test_break_level_requires_minute_duration(self):
		response = self.client.post(
			reverse("tournament-list"),
			{
				"name": "Broken",
				"max_players": 9,
				"players_per_table": 9,
				"levels": [
					{
						"is_break": True,
						"small_blind": 0,
						"big_blind": 0,
						"ante": 0,
						"duration_hands": 2,
					}
				],
			},
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("levels", response.data)

	def test_time_bank_blind_level_refill_cannot_exceed_blind_levels(self):
		response = self.client.post(
			reverse("tournament-list"),
			{
				"name": "Bad Bank",
				"late_reg_level": 1,
				"rebuy_level": 1,
				"time_bank_seconds": 30,
				"time_bank_refill_rule": "blind_level",
				"time_bank_refill_level": 3,
				"levels": [
					{
						"small_blind": 25,
						"big_blind": 50,
						"ante": 0,
						"duration_hands": 8,
					}
				],
			},
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("time_bank_refill_level", response.data)

	def test_payout_structure_percentages_must_total_100(self):
		response = self.client.post(
			reverse("tournament-list"),
			{
				"name": "Bad Payouts",
				"payout_structure": [
					{"place": 1, "label": "First", "percentage": 60},
					{"place": 2, "label": "Second", "percentage": 30},
				],
			},
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("payout_structure", response.data)

	def test_create_rejects_scheduled_start_in_the_past(self):
		response = self.client.post(
			reverse("tournament-list"),
			{
				"name": "Too Late",
				"scheduled_start_at": (timezone.now() - timedelta(minutes=5)).isoformat(),
			},
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("scheduled_start_at", response.data)

	def test_start_rejects_before_scheduled_time(self):
		tournament = Tournament.objects.create(
			host=self.user,
			name="Scheduled",
			scheduled_start_at=timezone.now() + timedelta(hours=1),
		)
		primary_table = tournament.ensure_table(1)
		tournament.players.create(user=self.user, table=primary_table, seat=0, seat_at_table=0, chips=10000)
		opponent = User.objects.create_user(username="opponent", password="secret123")
		tournament.players.create(user=opponent, table=primary_table, seat=1, seat_at_table=1, chips=10000)

		response = self.client.post(reverse("tournament-start", kwargs={"pk": tournament.id}))

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["error"], "Tournament is scheduled to start later")
		tournament.refresh_from_db()
		self.assertEqual(tournament.status, "lobby")

	def test_due_scheduled_tournament_starts_on_lobby_poll(self):
		tournament = Tournament.objects.create(
			host=self.user,
			name="Due Now",
			scheduled_start_at=timezone.now() - timedelta(minutes=1),
		)
		primary_table = tournament.ensure_table(1)
		tournament.players.create(user=self.user, table=primary_table, seat=0, seat_at_table=0, chips=10000)
		opponent = User.objects.create_user(username="due_opponent", password="secret123")
		tournament.players.create(user=opponent, table=primary_table, seat=1, seat_at_table=1, chips=10000)

		response = self.client.get(reverse("tournament-detail", kwargs={"pk": tournament.id}))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["status"], "running")
		tournament.refresh_from_db()
		self.assertEqual(tournament.status, "running")

	def test_start_allows_multi_table_runtime(self):
		tournament = Tournament.objects.create(
			host=self.user,
			name="MTT",
			starting_chips=10000,
			max_players=18,
			players_per_table=9,
		)
		primary_table = tournament.ensure_table(1)
		secondary_table = tournament.ensure_table(2)
		tournament.players.create(user=self.user, table=primary_table, seat=0, seat_at_table=0, chips=10000)
		for seat in range(1, 10):
			user = User.objects.create_user(username=f"player{seat}", password="secret123")
			tournament.players.create(
				user=user,
				table=primary_table if seat < 9 else secondary_table,
				seat=seat,
				seat_at_table=seat if seat < 9 else 0,
				chips=10000,
			)

		response = self.client.post(reverse("tournament-start", kwargs={"pk": tournament.id}))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		tournament.refresh_from_db()
		self.assertEqual(tournament.status, "running")

	def test_host_can_pause_and_resume_running_tournament(self):
		tournament = Tournament.objects.create(
			host=self.user,
			name="Admin Controls",
			status="running",
		)

		pause_response = self.client.post(reverse("tournament-pause", kwargs={"pk": tournament.id}))
		self.assertEqual(pause_response.status_code, status.HTTP_200_OK)
		tournament.refresh_from_db()
		self.assertEqual(tournament.status, "paused")

		resume_response = self.client.post(reverse("tournament-resume", kwargs={"pk": tournament.id}))
		self.assertEqual(resume_response.status_code, status.HTTP_200_OK)
		tournament.refresh_from_db()
		self.assertEqual(tournament.status, "running")

	def test_non_host_cannot_pause_tournament(self):
		tournament = Tournament.objects.create(
			host=self.user,
			name="Admin Controls",
			status="running",
		)
		other = User.objects.create_user(username="not-host", password="secret123")
		self.client.force_authenticate(other)

		response = self.client.post(reverse("tournament-pause", kwargs={"pk": tournament.id}))

		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
		tournament.refresh_from_db()
		self.assertEqual(tournament.status, "running")

	def test_host_can_skip_blind_level_when_runner_is_active(self):
		class FakeRunner:
			async def skip_level(self):
				return {"blind_level_number": 2, "skipped": True}

		tournament = Tournament.objects.create(
			host=self.user,
			name="Skip It",
			status="running",
		)
		_tournament_runners[tournament.id] = FakeRunner()

		response = self.client.post(reverse("tournament-skip-level", kwargs={"pk": tournament.id}))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["level"]["blind_level_number"], 2)
		self.assertTrue(response.data["level"]["skipped"])


class RebuyTests(APITestCase):
	def setUp(self):
		self.user = User.objects.create_user(username="rebuyer", password="secret123")
		self.client.force_authenticate(self.user)

	def tearDown(self):
		_tournament_runners.clear()

	def _tournament(self, **kwargs):
		defaults = dict(
			host=self.user,
			name="Rebuy Me",
			status="running",
			allow_rebuys=True,
			max_rebuys=2,
			rebuy_level=4,
			starting_chips=10_000,
		)
		defaults.update(kwargs)
		return Tournament.objects.create(**defaults)

	def _seat(self, tournament, **kwargs):
		defaults = dict(
			tournament=tournament,
			user=self.user,
			seat=0,
			chips=0,
			is_eliminated=True,
			finish_position=3,
		)
		defaults.update(kwargs)
		return TournamentPlayer.objects.create(**defaults)

	def test_rebuy_goes_through_the_running_engine(self):
		"""A DB-only rebuy is undone by the engine, so the view must reach it."""
		calls = []

		class FakeRunner:
			current_blind_level_number = 1

			async def apply_rebuy(self, user_id, chips):
				calls.append((user_id, chips))
				return ""

		tournament = self._tournament()
		seat = self._seat(tournament)
		_tournament_runners[tournament.id] = FakeRunner()

		response = self.client.post(reverse("tournament-rebuy", kwargs={"pk": tournament.id}))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(calls, [(self.user.id, 10_000)])
		seat.refresh_from_db()
		# Chips and is_eliminated are the coordinator's to persist (covered by
		# CoordinatorRebuyTests); the view owns only this bookkeeping.
		self.assertEqual(seat.rebuy_count, 1)
		self.assertIsNone(seat.finish_position)

	def test_rebuy_is_refused_once_the_tournament_is_resolving(self):
		class FinishingRunner:
			current_blind_level_number = 1

			async def apply_rebuy(self, user_id, chips):
				return "Tournament has ended"

		tournament = self._tournament()
		seat = self._seat(tournament)
		_tournament_runners[tournament.id] = FinishingRunner()

		response = self.client.post(reverse("tournament-rebuy", kwargs={"pk": tournament.id}))

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		seat.refresh_from_db()
		# The rebuy must not be spent when the engine refuses it.
		self.assertTrue(seat.is_eliminated)
		self.assertEqual(seat.rebuy_count, 0)


class CoordinatorRebuyTests(TestCase):
	"""The regression that motivated this: the run loop writes its in-memory
	players over the DB after every hand, so a rebuy that only touched the DB
	was silently reverted."""

	def _coordinator(self, persisted):
		async def noop(*args, **kwargs):
			return None

		async def capture(players):
			persisted.extend(
				{"tp_id": p._tp_id, "chips": p.chips, "is_eliminated": p.is_eliminated}
				for p in players
			)

		return MultiTableTournamentCoordinator(
			tournament_id=1,
			players_per_table=9,
			levels=[{"small_blind": 25, "big_blind": 50, "ante": 0, "duration_hands": 8}],
			broadcast_tournament=noop,
			broadcast_table=noop,
			request_action=noop,
			notify_user=noop,
			load_players=noop,
			persist_assignments=noop,
			persist_player_states=capture,
		)

	def _add_player(self, coordinator, tp_id, user_id, **kwargs):
		player = EnginePlayer(name=f"p{tp_id}", chips=kwargs.get("chips", 0))
		player._tp_id = tp_id
		player._user_id = user_id
		player._seat = 0
		player._global_seat = 0
		player._table_number = 1
		player.is_eliminated = kwargs.get("is_eliminated", False)
		player.finish_position = kwargs.get("finish_position", 0)
		coordinator._players_by_id[tp_id] = player
		coordinator._players_by_user_id[user_id] = player
		return player

	def test_rebuy_survives_the_next_persist(self):
		persisted = []
		coordinator = self._coordinator(persisted)
		busted = self._add_player(coordinator, 1, 11, chips=0, is_eliminated=True, finish_position=2)
		self._add_player(coordinator, 2, 22, chips=5000)
		coordinator._standings.append(busted)

		self.assertEqual(async_to_sync(coordinator.apply_rebuy)(11, 10_000), "")

		self.assertEqual(busted.chips, 10_000)
		self.assertFalse(busted.is_eliminated)
		self.assertEqual(busted.finish_position, 0)
		# Removed from standings, or the final results would list them twice.
		self.assertEqual(coordinator._standings, [])
		# What the loop would write to the DB now reflects the rebuy.
		self.assertIn({"tp_id": 1, "chips": 10_000, "is_eliminated": False}, persisted)

	def test_rebuy_applies_even_when_memory_lags_the_db(self):
		"""Eligibility is decided by the caller from the locked DB row; the
		in-memory copy only refreshes between hands, so it must not veto."""
		persisted = []
		coordinator = self._coordinator(persisted)
		lagging = self._add_player(coordinator, 1, 11, chips=0, is_eliminated=False)

		self.assertEqual(async_to_sync(coordinator.apply_rebuy)(11, 10_000), "")
		self.assertEqual(lagging.chips, 10_000)
		self.assertFalse(lagging.is_eliminated)

	def test_rebuy_refused_once_finishing(self):
		coordinator = self._coordinator([])
		self._add_player(coordinator, 1, 11, chips=0, is_eliminated=True, finish_position=1)
		coordinator._finishing = True

		self.assertEqual(async_to_sync(coordinator.apply_rebuy)(11, 10_000), "Tournament has ended")

	def test_sitting_out_flag_is_in_the_player_payload(self):
		"""It must ride the snapshot, unlike the client-only disconnected flag."""
		coordinator = self._coordinator([])
		player = self._add_player(coordinator, 1, 11, chips=5000)

		self.assertFalse(coordinator._player_payload(player)["is_sitting_out"])
		async_to_sync(coordinator.set_sitting_out)(11, True)
		self.assertTrue(coordinator._player_payload(player)["is_sitting_out"])
