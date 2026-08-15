import time

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
		# Creating tournaments is staff-only, so the host here is an organiser.
		self.user = User.objects.create_user(username="host", password="secret123", is_staff=True)
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

	def test_upcoming_lists_running_tournament_while_late_registration_is_open(self):
		class FakeRunner:
			current_blind_level_number = 1

		tournament = Tournament.objects.create(
			host=self.user,
			name="Late Reg Open",
			status="running",
			late_reg_level=4,
		)
		_tournament_runners[tournament.id] = FakeRunner()

		outsider = User.objects.create_user(username="outsider", password="secret123")
		self.client.force_authenticate(outsider)

		response = self.client.get(reverse("tournament-list"), {"scope": "upcoming"})

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		listed = {row["id"]: row for row in response.data}
		self.assertIn(tournament.id, listed)
		self.assertTrue(listed[tournament.id]["late_registration_open"])

	def test_upcoming_hides_running_tournament_once_late_registration_closes(self):
		class FakeRunner:
			current_blind_level_number = 5

		tournament = Tournament.objects.create(
			host=self.user,
			name="Late Reg Closed",
			status="running",
			late_reg_level=4,
		)
		_tournament_runners[tournament.id] = FakeRunner()

		outsider = User.objects.create_user(username="latecomer", password="secret123")
		self.client.force_authenticate(outsider)

		response = self.client.get(reverse("tournament-list"), {"scope": "upcoming"})

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertNotIn(tournament.id, [row["id"] for row in response.data])

	def test_upcoming_excludes_late_registration_tournament_already_joined(self):
		class FakeRunner:
			current_blind_level_number = 1

		tournament = Tournament.objects.create(
			host=self.user,
			name="Already In",
			status="running",
			late_reg_level=4,
		)
		table = tournament.ensure_table(1)
		tournament.players.create(user=self.user, table=table, seat=0, seat_at_table=0, chips=10000)
		_tournament_runners[tournament.id] = FakeRunner()

		response = self.client.get(reverse("tournament-list"), {"scope": "upcoming"})

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertNotIn(tournament.id, [row["id"] for row in response.data])


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


class QuitTests(APITestCase):
	def setUp(self):
		self.host = User.objects.create_user(username="quit-host", password="secret123")
		self.user = User.objects.create_user(username="leaver", password="secret123")
		self.client.force_authenticate(self.user)

	def _seated(self, **tournament_kwargs):
		tournament = Tournament.objects.create(
			host=self.host,
			name="Quitters",
			starting_chips=10_000,
			max_players=9,
			**tournament_kwargs,
		)
		table = tournament.ensure_table(1)
		tournament.players.create(
			user=self.host, table=table, seat=0, seat_at_table=0, chips=10_000,
		)
		seat = tournament.players.create(
			user=self.user, table=table, seat=1, seat_at_table=1, chips=10_000,
		)
		return tournament, seat

	def test_quit_before_start_frees_the_seat(self):
		tournament, _seat = self._seated()

		response = self.client.post(reverse("tournament-quit", kwargs={"pk": tournament.id}))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["status"], "unregistered")
		self.assertEqual(tournament.players.count(), 1)
		self.assertFalse(tournament.players.filter(user=self.user).exists())

	def test_freed_seat_can_be_taken_by_someone_else(self):
		tournament, _seat = self._seated()
		table = tournament.ensure_table(1)
		for filler in range(2, 9):
			user = User.objects.create_user(username=f"filler{filler}", password="secret123")
			tournament.players.create(
				user=user, table=table, seat=filler, seat_at_table=filler, chips=10_000,
			)

		self.client.post(reverse("tournament-quit", kwargs={"pk": tournament.id}))

		joiner = User.objects.create_user(username="joiner", password="secret123")
		self.client.force_authenticate(joiner)
		response = self.client.post(reverse("tournament-join", kwargs={"pk": tournament.id}))

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(response.data["seat"], 1)

	def test_host_cannot_leave_their_own_tournament(self):
		tournament, _seat = self._seated()
		self.client.force_authenticate(self.host)

		response = self.client.post(reverse("tournament-quit", kwargs={"pk": tournament.id}))

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["error"], "The host cannot leave their own tournament")
		self.assertTrue(tournament.players.filter(user=self.host).exists())

	def test_is_host_flag_is_in_the_lobby_payload(self):
		"""The lobby hides the Leave button with it, so it has to ride the list."""
		self._seated()

		as_player = self.client.get(reverse("tournament-list"), {"scope": "upcoming"})
		self.client.force_authenticate(self.host)
		as_host = self.client.get(reverse("tournament-list"), {"scope": "upcoming"})

		self.assertFalse(as_player.data[0]["is_host"])
		self.assertTrue(as_host.data[0]["is_host"])

	def test_quit_refused_once_the_tournament_is_running(self):
		tournament, _seat = self._seated(status="running")

		response = self.client.post(reverse("tournament-quit", kwargs={"pk": tournament.id}))

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(
			response.data["error"], "Cannot leave a tournament that has already started"
		)
		self.assertEqual(tournament.players.count(), 2)

	def test_quit_refused_once_the_tournament_is_paused(self):
		tournament, _seat = self._seated(status="paused")

		response = self.client.post(reverse("tournament-quit", kwargs={"pk": tournament.id}))

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(tournament.players.count(), 2)

	def test_quit_refused_for_a_player_without_a_seat(self):
		tournament, _seat = self._seated()
		outsider = User.objects.create_user(username="no-seat", password="secret123")
		self.client.force_authenticate(outsider)

		response = self.client.post(reverse("tournament-quit", kwargs={"pk": tournament.id}))

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["error"], "You are not in this tournament")


class TournamentProgressTests(TestCase):
	"""Blind progress must survive a restart: it used to live only in the
	coordinator's memory, so a restart rewound play to level 1."""

	LEVELS = [
		{"small_blind": 25, "big_blind": 50, "ante": 0, "duration_hands": 8},
		{"small_blind": 50, "big_blind": 100, "ante": 0, "duration_hands": 8},
		{"small_blind": 75, "big_blind": 150, "ante": 0, "duration_hands": 8},
	]

	def _coordinator(self, level_index=0, hands_in_level=0, progress=None):
		async def noop(*args, **kwargs):
			return None

		async def record(level, hands):
			progress.append((level, hands))

		return MultiTableTournamentCoordinator(
			tournament_id=1,
			players_per_table=9,
			levels=self.LEVELS,
			broadcast_tournament=noop,
			broadcast_table=noop,
			request_action=noop,
			notify_user=noop,
			load_players=noop,
			persist_assignments=noop,
			persist_player_states=noop,
			persist_progress=record if progress is not None else None,
			level_index=level_index,
			hands_in_level=hands_in_level,
		)

	def test_resumes_at_the_persisted_level(self):
		coordinator = self._coordinator(level_index=2, hands_in_level=5)

		self.assertEqual(coordinator._level_index, 2)
		self.assertEqual(coordinator._hands_in_level, 5)
		# current_blind_level_number counts playable levels up to the index.
		self.assertEqual(coordinator.current_blind_level_number, 3)

	def test_a_level_index_beyond_the_schedule_is_clamped(self):
		coordinator = self._coordinator(level_index=99)
		self.assertEqual(coordinator._level_index, len(self.LEVELS) - 1)

	def test_progress_is_reported_for_persistence(self):
		progress = []
		coordinator = self._coordinator(level_index=1, hands_in_level=3, progress=progress)

		async_to_sync(coordinator.persist_progress)(
			coordinator._level_index, coordinator._hands_in_level,
		)

		self.assertEqual(progress, [(1, 3)])


class DeleteTournamentTests(APITestCase):
	def setUp(self):
		self.host = User.objects.create_user(username="deleter", password="secret123")
		self.client.force_authenticate(self.host)

	def tearDown(self):
		_tournament_runners.clear()

	def _tournament(self, **kwargs):
		defaults = dict(host=self.host, name="Scrap Me", status="lobby")
		defaults.update(kwargs)
		return Tournament.objects.create(**defaults)

	def test_host_can_delete_a_tournament_that_never_started(self):
		tournament = self._tournament()

		response = self.client.delete(reverse("tournament-delete", kwargs={"pk": tournament.id}))

		self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
		self.assertFalse(Tournament.objects.filter(id=tournament.id).exists())

	def test_deleting_takes_the_registered_seats_with_it(self):
		tournament = self._tournament()
		other = User.objects.create_user(username="seated", password="secret123")
		TournamentPlayer.objects.create(tournament=tournament, user=other, seat=0, chips=1000)

		self.client.delete(reverse("tournament-delete", kwargs={"pk": tournament.id}))

		self.assertFalse(TournamentPlayer.objects.filter(tournament_id=tournament.id).exists())

	def test_a_started_tournament_cannot_be_deleted(self):
		"""Once play begins it owns results other players have a claim on."""
		tournament = self._tournament(status="running")

		response = self.client.delete(reverse("tournament-delete", kwargs={"pk": tournament.id}))

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertTrue(Tournament.objects.filter(id=tournament.id).exists())

	def test_only_the_host_can_delete(self):
		tournament = self._tournament()
		self.client.force_authenticate(User.objects.create_user(username="nosy", password="secret123"))

		response = self.client.delete(reverse("tournament-delete", kwargs={"pk": tournament.id}))

		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
		self.assertTrue(Tournament.objects.filter(id=tournament.id).exists())

	def test_a_lobby_tournament_with_a_live_engine_is_refused(self):
		tournament = self._tournament()
		_tournament_runners[tournament.id] = object()

		response = self.client.delete(reverse("tournament-delete", kwargs={"pk": tournament.id}))

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertTrue(Tournament.objects.filter(id=tournament.id).exists())


class TournamentPermissionTests(APITestCase):
	"""Opening a tournament sets stakes for other people, so it is staff-only."""

	def setUp(self):
		self.player = User.objects.create_user(username="justaplayer", password="secret123")
		self.staff = User.objects.create_user(username="organiser", password="secret123", is_staff=True)

	def tearDown(self):
		_tournament_runners.clear()

	def _create(self):
		return self.client.post(reverse("tournament-list"), {"name": "Friday Game"}, format="json")

	def test_a_plain_player_cannot_create_a_tournament(self):
		self.client.force_authenticate(self.player)

		response = self._create()

		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
		self.assertFalse(Tournament.objects.exists())

	def test_staff_can_create_a_tournament(self):
		self.client.force_authenticate(self.staff)

		response = self._create()

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertTrue(Tournament.objects.filter(host=self.staff).exists())

	def test_a_plain_player_can_still_browse(self):
		Tournament.objects.create(host=self.staff, name="Open Game", status="lobby")
		self.client.force_authenticate(self.player)

		response = self.client.get(reverse("tournament-list"))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(len(response.data), 1)

	def test_the_api_reports_staff_so_the_client_can_hide_what_it_must_not_offer(self):
		self.client.force_authenticate(self.player)
		self.assertFalse(self.client.get(reverse("me")).data["is_staff"])

		self.client.force_authenticate(self.staff)
		self.assertTrue(self.client.get(reverse("me")).data["is_staff"])


class PreflopStatsTests(TestCase):
	"""The definitions are what make these numbers comparable, so they are
	pinned here rather than left to whoever reads the query next."""

	def setUp(self):
		from game.models import Hand, HandAction
		self.Hand, self.HandAction = Hand, HandAction
		self.host = User.objects.create_user(username="s_host", password="x")
		self.tournament = Tournament.objects.create(host=self.host, name="Stats", status="running")
		self.players = {}
		for seat, name in enumerate(["hero", "villain", "third"]):
			user = User.objects.create_user(username=name, password="x")
			self.players[name] = TournamentPlayer.objects.create(
				tournament=self.tournament, user=user, seat=seat, seat_at_table=seat, chips=1000,
			)

	def _hand(self, number, dealer_seat, actions):
		hand = self.Hand.objects.create(
			tournament=self.tournament, hand_number=number, level_index=0,
			dealer_seat=dealer_seat, status="complete",
		)
		for entry in actions:
			# ("hero", "call") is preflop; a third item names another street.
			name, action, street = entry if len(entry) == 3 else (*entry, "preflop")
			player = self.players[name]
			self.HandAction.objects.create(
				hand=hand, player=player, seat=player.seat_at_table, street=street, action=action,
			)
		return hand

	def _stats(self, name):
		from game.hand_stats import compute_player_stats
		user_id = self.players[name].user_id
		return compute_player_stats([user_id])[user_id]

	def test_blinds_are_not_voluntary(self):
		self._hand(1, 0, [("hero", "blind"), ("villain", "blind"), ("third", "fold"), ("hero", "fold")])

		hero = self._stats("hero")
		self.assertEqual(hero["hands"], 1)
		self.assertEqual(hero["vpip_pct"], 0.0)

	def test_a_call_counts_as_voluntary_and_a_raise_as_pfr(self):
		self._hand(1, 0, [("hero", "blind"), ("villain", "blind"), ("third", "raise"), ("hero", "call")])

		self.assertEqual(self._stats("hero")["vpip_pct"], 100.0)
		self.assertEqual(self._stats("third")["pfr_pct"], 100.0)

	def test_three_bet_is_raising_over_a_raise(self):
		# third opens, hero raises over it: a 3-bet for hero, not for third.
		self._hand(1, 0, [("hero", "blind"), ("villain", "blind"), ("third", "raise"), ("hero", "raise")])

		hero = self._stats("hero")
		self.assertEqual(hero["three_bet_chances"], 1)
		self.assertEqual(hero["three_bet_pct"], 100.0)
		self.assertEqual(self._stats("third")["three_bet_chances"], 0)

	def test_a_steal_is_only_counted_when_first_in_from_a_steal_seat(self):
		# Seat 0 is the button with three players, so it is a steal seat, and
		# nobody has entered before it.
		self._hand(1, 0, [("villain", "blind"), ("third", "blind"), ("hero", "raise")])

		hero = self._stats("hero")
		self.assertEqual(hero["ats_chances"], 1)
		self.assertEqual(hero["ats_pct"], 100.0)

	def test_no_steal_credit_once_somebody_has_entered(self):
		self._hand(1, 0, [("villain", "blind"), ("third", "blind"), ("third", "raise"), ("hero", "raise")])

		self.assertEqual(self._stats("hero")["ats_chances"], 0)

	def test_answering_a_three_bet_is_one_decision_split_three_ways(self):
		# hero opens, third 3-bets, hero folds.
		self._hand(1, 0, [("hero", "blind"), ("villain", "blind"), ("hero", "raise"),
		                  ("third", "raise"), ("hero", "fold")])
		# The same, but hero calls.
		self._hand(2, 0, [("hero", "blind"), ("villain", "blind"), ("hero", "raise"),
		                  ("third", "raise"), ("hero", "call")])

		hero = self._stats("hero")
		self.assertEqual(hero["vs_three_bet_chances"], 2)
		self.assertEqual(hero["fold_to_three_bet_pct"], 50.0)
		self.assertEqual(hero["call_three_bet_pct"], 50.0)
		self.assertEqual(hero["four_bet_pct"], 0.0)
		# Facing the open is not facing a 3-bet.
		self.assertEqual(self._stats("third")["vs_three_bet_chances"], 0)

	def test_raising_over_a_three_bet_is_a_four_bet_and_the_reply_is_measured(self):
		self._hand(1, 0, [("hero", "blind"), ("villain", "blind"), ("hero", "raise"),
		                  ("third", "raise"), ("hero", "raise"), ("third", "fold")])

		hero = self._stats("hero")
		self.assertEqual(hero["four_bet_pct"], 100.0)
		third = self._stats("third")
		self.assertEqual(third["vs_four_bet_chances"], 1)
		self.assertEqual(third["fold_to_four_bet_pct"], 100.0)

	def test_a_continuation_bet_is_the_preflop_raiser_betting_the_flop_first(self):
		self._hand(1, 0, [("hero", "blind"), ("villain", "blind"), ("third", "fold"),
		                  ("hero", "raise"), ("villain", "call"),
		                  ("hero", "bet", "flop"), ("villain", "fold", "flop")])

		hero = self._stats("hero")
		self.assertEqual(hero["cbet_chances"], 1)
		self.assertEqual(hero["cbet_pct"], 100.0)
		self.assertEqual(hero["saw_flop_pct"], 100.0)

		villain = self._stats("villain")
		self.assertEqual(villain["fold_to_cbet_chances"], 1)
		self.assertEqual(villain["fold_to_cbet_pct"], 100.0)
		# Only the last preflop raiser can continuation bet.
		self.assertEqual(villain["cbet_chances"], 0)

	def test_checking_the_flop_as_the_raiser_is_a_missed_continuation_bet(self):
		self._hand(1, 0, [("hero", "blind"), ("villain", "blind"), ("third", "fold"),
		                  ("hero", "raise"), ("villain", "call"),
		                  ("villain", "check", "flop"), ("hero", "check", "flop")])

		hero = self._stats("hero")
		self.assertEqual(hero["cbet_chances"], 1)
		self.assertEqual(hero["cbet_pct"], 0.0)
		# Nobody bet, so nobody had a c-bet to fold to.
		self.assertEqual(self._stats("villain")["fold_to_cbet_chances"], 0)

	def test_aggression_is_the_share_of_postflop_actions_that_were_bets(self):
		self._hand(1, 0, [("hero", "blind"), ("villain", "blind"), ("third", "fold"),
		                  ("hero", "raise"), ("villain", "call"),
		                  ("hero", "bet", "flop"), ("villain", "call", "flop"),
		                  ("hero", "bet", "turn"), ("villain", "call", "turn")])

		# Two bets, no calls, and the preflop raise is not counted.
		self.assertEqual(self._stats("hero")["aggression_pct"], 100.0)
		self.assertEqual(self._stats("hero")["postflop_actions"], 2)
		self.assertEqual(self._stats("villain")["aggression_pct"], 0.0)
		self.assertEqual(self._stats("villain")["postflop_actions"], 2)


class LedgerTests(TestCase):
	"""The money arithmetic. Everything here is in cents on purpose."""

	def setUp(self):
		from tournaments.models import LedgerEntry, Settlement
		self.LedgerEntry, self.Settlement = LedgerEntry, Settlement
		self.host = User.objects.create_user(username="l_host", password="x")
		self.users = {n: User.objects.create_user(username=n, password="x") for n in ["ana", "bea", "caio"]}

	def _tournament(self, buy_in=1000, payouts=None):
		return Tournament.objects.create(
			host=self.host, name="Money", status="finished",
			buy_in_cents=buy_in,
			payout_structure=payouts if payouts is not None else [
				{"place": 1, "label": "1st", "percentage": 70},
				{"place": 2, "label": "2nd", "percentage": 30},
			],
		)

	def _seat(self, tournament, name, seat, finish, rebuys=0):
		return TournamentPlayer.objects.create(
			tournament=tournament, user=self.users[name], seat=seat, chips=0,
			finish_position=finish, rebuy_count=rebuys, is_eliminated=finish != 1,
		)

	def _settle(self, tournament):
		from tournaments.ledger import settle_tournament
		return settle_tournament(tournament)

	def test_the_pot_is_paid_out_in_full(self):
		t = self._tournament(buy_in=1000)
		self._seat(t, "ana", 0, 1)
		self._seat(t, "bea", 1, 2)
		self._seat(t, "caio", 2, 3)

		self._settle(t)

		entries = self.LedgerEntry.objects.filter(tournament=t)
		self.assertEqual(sum(e.stake_cents for e in entries), 3000)
		self.assertEqual(sum(e.prize_cents for e in entries), 3000)

	def test_a_rebuy_is_another_buy_in(self):
		t = self._tournament(buy_in=1000)
		self._seat(t, "ana", 0, 1)
		self._seat(t, "bea", 1, 2, rebuys=2)

		self._settle(t)

		bea = self.LedgerEntry.objects.get(tournament=t, user=self.users["bea"])
		self.assertEqual(bea.stake_cents, 3000)
		# Their rebuys grew the pot, so first place takes 70% of 4000.
		ana = self.LedgerEntry.objects.get(tournament=t, user=self.users["ana"])
		self.assertEqual(ana.prize_cents, 2800)

	def test_the_rounding_remainder_goes_to_first_place(self):
		# Three equal stakes of 3.33 split 70/30 does not divide cleanly.
		t = self._tournament(buy_in=333)
		self._seat(t, "ana", 0, 1)
		self._seat(t, "bea", 1, 2)
		self._seat(t, "caio", 2, 3)

		self._settle(t)

		entries = self.LedgerEntry.objects.filter(tournament=t)
		self.assertEqual(sum(e.prize_cents for e in entries), 999)
		ana = self.LedgerEntry.objects.get(tournament=t, user=self.users["ana"])
		self.assertEqual(ana.prize_cents, 999 - int(999 * 30 / 100))

	def test_balances_across_everyone_net_to_zero(self):
		from tournaments.ledger import balances
		t = self._tournament(buy_in=1000)
		self._seat(t, "ana", 0, 1)
		self._seat(t, "bea", 1, 2)
		self._seat(t, "caio", 2, 3)

		self._settle(t)

		self.assertEqual(sum(balances().values()), 0)

	def test_settling_twice_changes_nothing(self):
		t = self._tournament()
		self._seat(t, "ana", 0, 1)
		self._seat(t, "bea", 1, 2)

		self.assertTrue(self._settle(t))
		self.assertFalse(self._settle(t))
		self.assertEqual(self.LedgerEntry.objects.filter(tournament=t).count(), 2)

	def test_a_tournament_with_no_buy_in_records_nothing(self):
		t = self._tournament(buy_in=0)
		self._seat(t, "ana", 0, 1)

		self.assertFalse(self._settle(t))
		self.assertFalse(self.LedgerEntry.objects.exists())

	def test_a_tournament_that_took_money_but_named_no_winners_is_left_alone(self):
		t = self._tournament(buy_in=1000, payouts=[])
		self._seat(t, "ana", 0, 1)

		self.assertFalse(self._settle(t))
		self.assertFalse(self.LedgerEntry.objects.exists())

	def test_a_payment_moves_both_sides(self):
		from tournaments.ledger import balances
		t = self._tournament(buy_in=1000)
		self._seat(t, "ana", 0, 1)
		self._seat(t, "bea", 1, 2)
		self._settle(t)

		before = balances()
		self.Settlement.objects.create(
			from_user=self.users["bea"], to_user=self.users["ana"], amount_cents=400,
		)
		after = balances()

		self.assertEqual(after.get(self.users["ana"].id, 0), before[self.users["ana"].id] - 400)
		self.assertEqual(after.get(self.users["bea"].id, 0), before[self.users["bea"].id] + 400)

	def test_the_suggestion_clears_everyone(self):
		from tournaments.ledger import balances, suggested_transfers
		t = self._tournament(buy_in=1000)
		self._seat(t, "ana", 0, 1)
		self._seat(t, "bea", 1, 2)
		self._seat(t, "caio", 2, 3)
		self._settle(t)

		current = balances()
		for transfer in suggested_transfers(current):
			current[transfer["from_user_id"]] += transfer["amount_cents"]
			current[transfer["to_user_id"]] -= transfer["amount_cents"]

		self.assertEqual({user: cents for user, cents in current.items() if cents}, {})


class SettlementEndpointTests(APITestCase):
	def setUp(self):
		self.ana = User.objects.create_user(username="e_ana", password="x")
		self.bea = User.objects.create_user(username="e_bea", password="x")
		host = User.objects.create_user(username="e_host", password="x")
		t = Tournament.objects.create(
			host=host, name="Owed", status="finished", buy_in_cents=1000,
			payout_structure=[{"place": 1, "label": "1st", "percentage": 100}],
		)
		TournamentPlayer.objects.create(tournament=t, user=self.ana, seat=0, chips=0, finish_position=1)
		TournamentPlayer.objects.create(tournament=t, user=self.bea, seat=1, chips=0, finish_position=2, is_eliminated=True)
		from tournaments.ledger import settle_tournament
		settle_tournament(t)
		# bea staked 10 and won nothing; ana is owed 10.

	def test_the_receiver_can_record_a_payment(self):
		self.client.force_authenticate(self.ana)

		response = self.client.post(reverse("ledger-settle"), {"from_username": "e_bea", "amount_eur": 10}, format="json")

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(response.data["balance_cents"], 0)

	def test_more_than_is_owed_is_refused(self):
		from tournaments.models import Settlement
		self.client.force_authenticate(self.ana)

		response = self.client.post(reverse("ledger-settle"), {"from_username": "e_bea", "amount_eur": 25}, format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertFalse(Settlement.objects.exists())

	def test_the_payer_cannot_clear_their_own_debt(self):
		from tournaments.models import Settlement
		# bea owes ana, so bea claiming to have received from ana is not a debt.
		self.client.force_authenticate(self.bea)

		response = self.client.post(reverse("ledger-settle"), {"from_username": "e_ana", "amount_eur": 10}, format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertFalse(Settlement.objects.exists())

	def test_my_ledger_shows_only_what_involves_me(self):
		self.client.force_authenticate(self.ana)

		data = self.client.get(reverse("ledger-me")).data

		self.assertEqual(data["balance_cents"], 1000)
		self.assertEqual([row["username"] for row in data["owed_to_me"]], ["e_bea"])
		self.assertEqual(data["i_owe"], [])


class BountySplitTests(TestCase):
	"""The arithmetic, on its own — no database, no hand in progress."""

	def test_a_fixed_bounty_is_paid_entirely_in_cash(self):
		from tournaments.bounties import BountyConfig, split_knockout

		config = BountyConfig(mode="fixed", amount_cents=1000)
		awards = split_knockout(config, 1000, 1)

		self.assertEqual(len(awards), 1)
		self.assertEqual(awards[0].cash_cents, 1000)
		self.assertEqual(awards[0].to_head_cents, 0)

	def test_a_progressive_bounty_half_pays_out_and_half_goes_on_the_head(self):
		from tournaments.bounties import BountyConfig, split_knockout

		config = BountyConfig(mode="progressive", amount_cents=1000, progressive_split_pct=50)
		awards = split_knockout(config, 1500, 1)

		self.assertEqual(awards[0].cash_cents, 750)
		self.assertEqual(awards[0].to_head_cents, 750)

	def test_a_split_pot_splits_the_bounty_without_losing_a_cent(self):
		from tournaments.bounties import BountyConfig, split_knockout

		config = BountyConfig(mode="progressive", amount_cents=1000, progressive_split_pct=50)
		awards = split_knockout(config, 1001, 3)

		self.assertEqual(len(awards), 3)
		self.assertEqual(sum(a.cash_cents + a.to_head_cents for a in awards), 1001)
		# The odd cents go to the first eliminator rather than evaporating.
		self.assertEqual([a.cash_cents + a.to_head_cents for a in awards], [334, 334, 333])

	def test_the_last_knockout_pays_the_whole_bounty_in_cash(self):
		from tournaments.bounties import BountyConfig, split_knockout

		config = BountyConfig(mode="progressive", amount_cents=1000, progressive_split_pct=50)
		awards = split_knockout(config, 2000, 1, is_final_knockout=True)

		# Nobody is left to collect off the winner's head, so growing it would
		# be money that never gets paid.
		self.assertEqual(awards[0].cash_cents, 2000)
		self.assertEqual(awards[0].to_head_cents, 0)

	def test_no_bounty_configured_awards_nothing(self):
		from tournaments.bounties import BountyConfig, split_knockout

		self.assertEqual(split_knockout(BountyConfig(), 1000, 1), [])


class BountyLedgerTests(TestCase):
	"""Settlement has to pay out every cent that went onto a head."""

	def setUp(self):
		self.host = User.objects.create_user(username="k_host", password="secret123", is_staff=True)
		self.bea = User.objects.create_user(username="k_bea", password="secret123")
		self.cid = User.objects.create_user(username="k_cid", password="secret123")

	def _tournament(self, **overrides):
		defaults = dict(
			host=self.host,
			name="KO night",
			status="finished",
			buy_in_cents=2000,
			bounty_mode="progressive",
			bounty_cents=1000,
			bounty_progressive_split_pct=50,
			payout_structure=[{"place": 1, "label": "1st", "percentage": 100}],
		)
		defaults.update(overrides)
		return Tournament.objects.create(**defaults)

	def test_the_whole_bounty_pool_is_paid_out(self):
		from tournaments.ledger import settle_tournament
		from tournaments.models import LedgerEntry

		t = self._tournament()
		# host knocked both out: cid's bounty went half to cash and half onto
		# host's head, then bea's whole bounty in cash as the final knockout.
		TournamentPlayer.objects.create(
			tournament=t, user=self.host, seat=0, chips=30000, finish_position=1,
			bounty_cents=1500, bounty_won_cents=1500, knockouts=2,
		)
		TournamentPlayer.objects.create(
			tournament=t, user=self.bea, seat=1, chips=0, finish_position=2, is_eliminated=True,
		)
		TournamentPlayer.objects.create(
			tournament=t, user=self.cid, seat=2, chips=0, finish_position=3, is_eliminated=True,
		)

		settle_tournament(t)

		entries = {e.user_id: e for e in LedgerEntry.objects.filter(tournament=t)}
		# Three buy-ins of 20€: 30€ played for by placing, 30€ in bounties.
		self.assertEqual(sum(e.stake_cents for e in entries.values()), 6000)
		self.assertEqual(sum(e.prize_cents for e in entries.values()), 6000)
		# The winner takes the 30€ of places plus the 30€ of bounties: the 15€
		# banked, and the 15€ left sitting on their own head.
		self.assertEqual(entries[self.host.id].prize_cents, 6000)
		self.assertEqual(entries[self.host.id].bounty_prize_cents, 3000)
		self.assertEqual(entries[self.bea.id].prize_cents, 0)

	def test_a_bounty_nobody_claimed_goes_back_to_its_owner(self):
		from tournaments.ledger import settle_tournament
		from tournaments.models import LedgerEntry

		t = self._tournament()
		TournamentPlayer.objects.create(
			tournament=t, user=self.host, seat=0, chips=30000, finish_position=1, bounty_cents=1000,
		)
		# Removed for being offline — nobody knocked them out, so their bounty
		# was never anybody's to take and it is still on their head.
		TournamentPlayer.objects.create(
			tournament=t, user=self.bea, seat=1, chips=0, finish_position=2,
			is_eliminated=True, bounty_cents=1000,
		)

		settle_tournament(t)

		entries = {e.user_id: e for e in LedgerEntry.objects.filter(tournament=t)}
		self.assertEqual(sum(e.prize_cents for e in entries.values()), 4000)
		self.assertEqual(entries[self.bea.id].prize_cents, 1000)

	def test_a_rebuy_buys_another_bounty_into_the_pool(self):
		from tournaments.ledger import settle_tournament
		from tournaments.models import LedgerEntry

		t = self._tournament()
		# bea was knocked out twice, having bought a second bounty in between:
		# 5€ cash and 5€ onto the head the first time, then the whole 10€ in
		# cash as the knockout that ended it.
		TournamentPlayer.objects.create(
			tournament=t, user=self.host, seat=0, chips=30000, finish_position=1,
			bounty_cents=1500, bounty_won_cents=1500, knockouts=2,
		)
		TournamentPlayer.objects.create(
			tournament=t, user=self.bea, seat=1, chips=0, finish_position=2,
			is_eliminated=True, rebuy_count=1,
		)

		settle_tournament(t)

		entries = {e.user_id: e for e in LedgerEntry.objects.filter(tournament=t)}
		# Three buy-ins in total, one of them a rebuy.
		self.assertEqual(sum(e.stake_cents for e in entries.values()), 6000)
		self.assertEqual(sum(e.prize_cents for e in entries.values()), 6000)

	def test_a_tournament_without_bounties_settles_exactly_as_before(self):
		from tournaments.ledger import settle_tournament
		from tournaments.models import LedgerEntry

		t = self._tournament(bounty_mode="none", bounty_cents=0)
		TournamentPlayer.objects.create(tournament=t, user=self.host, seat=0, chips=30000, finish_position=1)
		TournamentPlayer.objects.create(
			tournament=t, user=self.bea, seat=1, chips=0, finish_position=2, is_eliminated=True,
		)

		settle_tournament(t)

		entries = {e.user_id: e for e in LedgerEntry.objects.filter(tournament=t)}
		self.assertEqual(entries[self.host.id].prize_cents, 4000)
		self.assertEqual(entries[self.host.id].bounty_prize_cents, 0)


class BountyConfigurationTests(APITestCase):
	def setUp(self):
		self.user = User.objects.create_user(username="ko_host", password="secret123", is_staff=True)
		self.client.force_authenticate(self.user)

	def tearDown(self):
		_tournament_runners.clear()

	def _payload(self, **overrides):
		payload = {
			"name": "KO",
			"buy_in_cents": 2000,
			"payout_structure": [{"place": 1, "label": "1st", "percentage": 100}],
			"bounty_mode": "progressive",
			"bounty_cents": 1000,
			"bounty_progressive_split_pct": 50,
		}
		payload.update(overrides)
		return payload

	def test_a_progressive_tournament_is_created_and_the_host_gets_a_bounty(self):
		response = self.client.post(reverse("tournament-list"), self._payload(), format="json")

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		tournament = Tournament.objects.get(id=response.data["id"])
		self.assertEqual(tournament.bounty_mode, "progressive")
		self.assertEqual(tournament.players.get().bounty_cents, 1000)

	def test_a_bounty_bigger_than_the_buy_in_is_refused(self):
		response = self.client.post(
			reverse("tournament-list"), self._payload(bounty_cents=2000), format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("bounty_cents", response.data)

	def test_bounties_without_a_buy_in_are_refused(self):
		response = self.client.post(
			reverse("tournament-list"),
			self._payload(buy_in_cents=0, payout_structure=[]),
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_turning_bounties_off_clears_the_amount(self):
		response = self.client.post(
			reverse("tournament-list"), self._payload(bounty_mode="none"), format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(Tournament.objects.get(id=response.data["id"]).bounty_cents, 0)


class KnockoutAttributionTests(TestCase):
	"""Whose bounty went to whom, decided by the pot the busted player was
	actually playing for rather than by who won the hand."""

	def _player(self, name, invested, folded=False):
		player = EnginePlayer(name=name, chips=0)
		player.total_invested = invested
		player.is_folded = folded
		return player

	def test_the_side_pot_winner_does_not_collect_the_short_stack(self):
		from game.engine.hand import Pot, _attribute_knockouts

		short = self._player("short", 100)
		caller = self._player("caller", 500)
		raiser = self._player("raiser", 500)
		# Main pot everyone contested, side pot only the two deep stacks.
		pots = [Pot(amount=300, eligible=[short, caller, raiser]),
				Pot(amount=800, eligible=[caller, raiser])]

		knockouts = _attribute_knockouts([short], pots, [[caller], [raiser]])

		# The short stack was never playing for the side pot, so the bounty
		# belongs to whoever took the main pot.
		self.assertEqual(knockouts, [(short, [caller])])

	def test_a_split_pot_names_both_winners(self):
		from game.engine.hand import Pot, _attribute_knockouts

		victim = self._player("victim", 100)
		one = self._player("one", 100)
		two = self._player("two", 100)
		pots = [Pot(amount=300, eligible=[victim, one, two])]

		knockouts = _attribute_knockouts([victim], pots, [[one, two]])

		self.assertEqual(knockouts, [(victim, [one, two])])

	def test_a_player_all_in_for_the_ante_alone_still_has_an_eliminator(self):
		from game.engine.hand import Pot, _attribute_knockouts

		# Antes are dead money and never reach a pot, so this player is in no
		# pot's eligible list at all. The main pot took them out.
		anted_off = self._player("anted", 0)
		winner = self._player("winner", 500)
		pots = [Pot(amount=600, eligible=[winner])]

		knockouts = _attribute_knockouts([anted_off], pots, [[winner]])

		self.assertEqual(knockouts, [(anted_off, [winner])])

	def test_the_winner_of_a_pot_is_never_their_own_eliminator(self):
		from game.engine.hand import Pot, _attribute_knockouts

		lone = self._player("lone", 100)
		pots = [Pot(amount=100, eligible=[lone])]

		self.assertEqual(_attribute_knockouts([lone], pots, [[lone]]), [])


class CoordinatorBountyTests(TestCase):
	"""Bounties moving between heads while the tournament runs."""

	def _coordinator(self, bounty, broadcasts=None, persisted=None):
		async def noop(*args, **kwargs):
			return None

		async def capture_table(table_number, event_type, payload):
			if broadcasts is not None:
				broadcasts.append((event_type, payload))

		async def capture_states(players):
			if persisted is not None:
				persisted.extend(
					{"tp_id": p._tp_id, "bounty_cents": getattr(p, "_bounty_cents", 0)}
					for p in players
				)

		return MultiTableTournamentCoordinator(
			tournament_id=1,
			players_per_table=9,
			levels=[{"small_blind": 25, "big_blind": 50, "ante": 0, "duration_hands": 8}],
			broadcast_tournament=noop,
			broadcast_table=capture_table,
			request_action=noop,
			notify_user=noop,
			load_players=noop,
			persist_assignments=noop,
			persist_player_states=capture_states,
			bounty=bounty,
		)

	def _player(self, coordinator, tp_id, name, bounty_cents=0, chips=1000):
		player = EnginePlayer(name=name, chips=chips)
		player._tp_id = tp_id
		player._user_id = tp_id * 11
		player._seat = tp_id
		player._global_seat = tp_id
		player._table_number = 1
		player._bounty_cents = bounty_cents
		coordinator._players_by_id[tp_id] = player
		coordinator._players_by_user_id[player._user_id] = player
		return player

	def test_a_progressive_knockout_splits_between_cash_and_the_winners_head(self):
		from tournaments.bounties import BountyConfig

		coordinator = self._coordinator(
			BountyConfig(mode="progressive", amount_cents=1000, progressive_split_pct=50)
		)
		victim = self._player(coordinator, 1, "victim", bounty_cents=1000, chips=0)
		hunter = self._player(coordinator, 2, "hunter", bounty_cents=1000)

		async_to_sync(coordinator._pay_bounty)(victim, [hunter])

		self.assertEqual(hunter._bounty_won_cents, 500)
		self.assertEqual(hunter._bounty_cents, 1500)
		self.assertEqual(hunter._knockouts, 1)
		# Taken off the head, so it can never be collected twice.
		self.assertEqual(victim._bounty_cents, 0)

	def test_a_fixed_knockout_leaves_the_winners_own_head_alone(self):
		from tournaments.bounties import BountyConfig

		coordinator = self._coordinator(BountyConfig(mode="fixed", amount_cents=1000))
		victim = self._player(coordinator, 1, "victim", bounty_cents=1000, chips=0)
		hunter = self._player(coordinator, 2, "hunter", bounty_cents=1000)

		async_to_sync(coordinator._pay_bounty)(victim, [hunter])

		self.assertEqual(hunter._bounty_won_cents, 1000)
		self.assertEqual(hunter._bounty_cents, 1000)

	def test_the_knockout_that_ends_it_pays_the_whole_bounty_in_cash(self):
		from tournaments.bounties import BountyConfig

		coordinator = self._coordinator(
			BountyConfig(mode="progressive", amount_cents=1000, progressive_split_pct=50)
		)
		victim = self._player(coordinator, 1, "victim", bounty_cents=2000, chips=0)
		hunter = self._player(coordinator, 2, "hunter", bounty_cents=1000)

		async_to_sync(coordinator._pay_bounty)(victim, [hunter], is_final=True)

		self.assertEqual(hunter._bounty_won_cents, 2000)
		self.assertEqual(hunter._bounty_cents, 1000)

	def test_nobody_claims_the_bounty_of_a_player_nobody_knocked_out(self):
		from tournaments.bounties import BountyConfig

		coordinator = self._coordinator(BountyConfig(mode="fixed", amount_cents=1000))
		victim = self._player(coordinator, 1, "victim", bounty_cents=1000, chips=0)

		async_to_sync(coordinator._pay_bounty)(victim, [])

		# Still on their head, which is what makes settlement hand it back.
		self.assertEqual(victim._bounty_cents, 1000)

	def test_the_table_is_told_about_a_bounty_changing_hands(self):
		from tournaments.bounties import BountyConfig

		broadcasts = []
		coordinator = self._coordinator(
			BountyConfig(mode="progressive", amount_cents=1000, progressive_split_pct=50),
			broadcasts=broadcasts,
		)
		victim = self._player(coordinator, 1, "victim", bounty_cents=1000, chips=0)
		hunter = self._player(coordinator, 2, "hunter", bounty_cents=1000)

		async_to_sync(coordinator._pay_bounty)(victim, [hunter])

		event_type, payload = broadcasts[-1]
		self.assertEqual(event_type, "bounty_won")
		self.assertEqual(payload["victim_name"], "victim")
		self.assertEqual(payload["cash_cents"], 500)
		self.assertEqual(payload["to_head_cents"], 500)
		self.assertEqual(payload["bounty_cents"], 1500)

	def test_a_rebuy_puts_a_fresh_bounty_on_the_head(self):
		from tournaments.bounties import BountyConfig

		coordinator = self._coordinator(BountyConfig(mode="progressive", amount_cents=1000))
		player = self._player(coordinator, 1, "back", bounty_cents=0, chips=0)
		player.is_eliminated = True

		self.assertEqual(async_to_sync(coordinator.apply_rebuy)(11, 10_000), "")

		self.assertEqual(player._bounty_cents, 1000)

	def test_the_bounty_rides_the_player_payload(self):
		from tournaments.bounties import BountyConfig

		coordinator = self._coordinator(BountyConfig(mode="fixed", amount_cents=1000))
		player = self._player(coordinator, 1, "seat", bounty_cents=1000)

		payload = coordinator._player_payload(player)

		self.assertEqual(payload["bounty_cents"], 1000)
		self.assertEqual(payload["bounty_won_cents"], 0)
		self.assertEqual(payload["knockouts"], 0)


class ReadyToStartTests(TestCase):
	"""The pre-tournament countdown, cut short when everybody says so."""

	def _coordinator(self, broadcasts=None):
		async def noop(*args, **kwargs):
			return None

		async def capture(event_type, payload):
			if broadcasts is not None:
				broadcasts.append((event_type, payload))

		return MultiTableTournamentCoordinator(
			tournament_id=1,
			players_per_table=9,
			levels=[{"small_blind": 25, "big_blind": 50, "ante": 0, "duration_hands": 8}],
			broadcast_tournament=capture,
			broadcast_table=noop,
			request_action=noop,
			notify_user=noop,
			load_players=noop,
			persist_assignments=noop,
			persist_player_states=noop,
		)

	def _seat(self, coordinator, tp_id, chips=5000):
		player = EnginePlayer(name=f"p{tp_id}", chips=chips)
		player._tp_id = tp_id
		player._user_id = tp_id * 11
		player._seat = tp_id
		player._global_seat = tp_id
		player._table_number = 1
		coordinator._players_by_id[tp_id] = player
		coordinator._players_by_user_id[player._user_id] = player
		return player

	def test_nobody_is_ready_to_begin_with(self):
		coordinator = self._coordinator()
		self._seat(coordinator, 1)
		self._seat(coordinator, 2)
		coordinator._countdown_open = True

		self.assertFalse(coordinator._everyone_ready())

	def test_every_seat_saying_so_is_what_starts_it(self):
		coordinator = self._coordinator()
		self._seat(coordinator, 1)
		self._seat(coordinator, 2)
		coordinator._countdown_open = True

		self.assertTrue(async_to_sync(coordinator.set_ready)(11))
		self.assertFalse(coordinator._everyone_ready())

		async_to_sync(coordinator.set_ready)(22)
		self.assertTrue(coordinator._everyone_ready())

	def test_one_player_cannot_start_it_for_everybody(self):
		"""The countdown exists so people can load the table. If readiness only
		counted the connected, the first to arrive could skip it alone."""
		coordinator = self._coordinator()
		self._seat(coordinator, 1)
		self._seat(coordinator, 2)
		self._seat(coordinator, 3)
		coordinator._countdown_open = True

		async_to_sync(coordinator.set_ready)(11)

		self.assertFalse(coordinator._everyone_ready())

	def test_a_player_can_change_their_mind(self):
		coordinator = self._coordinator()
		self._seat(coordinator, 1)
		coordinator._countdown_open = True

		async_to_sync(coordinator.set_ready)(11)
		self.assertTrue(coordinator._everyone_ready())

		async_to_sync(coordinator.set_ready)(11, False)
		self.assertFalse(coordinator._everyone_ready())

	def test_readiness_is_refused_once_the_tournament_is_under_way(self):
		coordinator = self._coordinator()
		self._seat(coordinator, 1)
		# The countdown is over: a late click must not cut short anything else.
		coordinator._countdown_open = False

		self.assertFalse(async_to_sync(coordinator.set_ready)(11))
		self.assertEqual(coordinator._ready_user_ids, set())

	def test_an_empty_table_is_never_ready(self):
		coordinator = self._coordinator()
		coordinator._countdown_open = True

		self.assertFalse(coordinator._everyone_ready())

	def test_the_tally_only_counts_players_who_still_have_a_seat(self):
		coordinator = self._coordinator()
		self._seat(coordinator, 1)
		gone = self._seat(coordinator, 2)
		coordinator._countdown_open = True
		async_to_sync(coordinator.set_ready)(11)
		async_to_sync(coordinator.set_ready)(22)

		# They left between the click and the broadcast.
		gone.is_eliminated = True

		broadcasts = []
		coordinator.broadcast_tournament = lambda event_type, payload: _record(broadcasts, event_type, payload)
		async_to_sync(coordinator._broadcast_ready_state)()

		event_type, payload = broadcasts[-1]
		self.assertEqual(event_type, "ready_state")
		self.assertEqual(payload["total"], 1)
		self.assertEqual(payload["ready_user_ids"], [11])


async def _record(sink, event_type, payload):
	sink.append((event_type, payload))


class ShowCardsTests(TestCase):
	"""Showing your hand after it is over, and the gap that makes it worth doing."""

	def _coordinator(self, broadcasts=None):
		async def noop(*args, **kwargs):
			return None

		async def capture(table_number, event_type, payload):
			if broadcasts is not None:
				broadcasts.append((event_type, payload))

		return MultiTableTournamentCoordinator(
			tournament_id=1,
			players_per_table=9,
			levels=[{"small_blind": 25, "big_blind": 50, "ante": 0, "duration_hands": 8}],
			broadcast_tournament=noop,
			broadcast_table=capture,
			request_action=noop,
			notify_user=noop,
			load_players=noop,
			persist_assignments=noop,
			persist_player_states=noop,
		)

	def _seat_with_cards(self, coordinator, tp_id=1):
		from game.engine.card import Card, Rank, Suit

		player = EnginePlayer(name=f"p{tp_id}", chips=5000)
		player._tp_id = tp_id
		player._user_id = tp_id * 11
		player._seat = tp_id
		player._global_seat = tp_id
		player._table_number = 1
		player.hole_cards = [Card(Rank.ACE, Suit.SPADES), Card(Rank.KING, Suit.HEARTS)]
		coordinator._players_by_id[tp_id] = player
		coordinator._players_by_user_id[player._user_id] = player
		return player

	def test_both_cards_reach_the_table(self):
		broadcasts = []
		coordinator = self._coordinator(broadcasts)
		self._seat_with_cards(coordinator)
		coordinator._show_open = True
		coordinator._show_deadline = time.monotonic() + 3

		self.assertTrue(async_to_sync(coordinator.show_cards)(11, [0, 1]))

		event_type, payload = broadcasts[-1]
		self.assertEqual(event_type, "cards_shown")
		self.assertEqual(len(payload["cards"]), 2)
		self.assertEqual(payload["indices"], [0, 1])

	def test_one_card_shows_only_that_card(self):
		broadcasts = []
		coordinator = self._coordinator(broadcasts)
		self._seat_with_cards(coordinator)
		coordinator._show_open = True

		async_to_sync(coordinator.show_cards)(11, [1])

		_, payload = broadcasts[-1]
		self.assertEqual(len(payload["cards"]), 1)
		self.assertEqual(payload["indices"], [1])

	def test_showing_is_refused_while_a_hand_is_being_played(self):
		"""Telling the table what you hold while people are still deciding is
		not something live poker allows either."""
		broadcasts = []
		coordinator = self._coordinator(broadcasts)
		self._seat_with_cards(coordinator)
		coordinator._show_open = False

		self.assertFalse(async_to_sync(coordinator.show_cards)(11, [0, 1]))
		self.assertEqual(broadcasts, [])

	def test_showing_twice_in_one_hand_is_refused(self):
		coordinator = self._coordinator([])
		self._seat_with_cards(coordinator)
		coordinator._show_open = True

		self.assertTrue(async_to_sync(coordinator.show_cards)(11, [0]))
		# Otherwise one player could hold the gap open a card at a time.
		self.assertFalse(async_to_sync(coordinator.show_cards)(11, [1]))

	def test_showing_buys_the_table_time_to_look(self):
		coordinator = self._coordinator([])
		self._seat_with_cards(coordinator)
		coordinator._show_open = True
		coordinator._show_deadline = time.monotonic() + 0.2

		async_to_sync(coordinator.show_cards)(11, [0, 1])

		# The next deal must not land on top of what was just shown.
		self.assertGreater(coordinator._show_deadline - time.monotonic(), 3)

	def test_nonsense_indices_show_nothing(self):
		broadcasts = []
		coordinator = self._coordinator(broadcasts)
		self._seat_with_cards(coordinator)
		coordinator._show_open = True

		self.assertFalse(async_to_sync(coordinator.show_cards)(11, [5, -1]))
		self.assertEqual(broadcasts, [])

	def test_a_player_holding_no_cards_shows_nothing(self):
		coordinator = self._coordinator([])
		player = self._seat_with_cards(coordinator)
		player.hole_cards = []
		coordinator._show_open = True

		self.assertFalse(async_to_sync(coordinator.show_cards)(11, [0, 1]))

	def test_the_gap_ends_on_its_own_when_nobody_shows(self):
		coordinator = self._coordinator([])
		coordinator.INTER_HAND_SECONDS = 0.05

		started = time.monotonic()
		async_to_sync(coordinator._inter_hand_pause)()

		self.assertGreaterEqual(time.monotonic() - started, 0.05)
		# And the window is shut again, so a late click cannot reveal anything.
		self.assertFalse(coordinator._show_open)


class ShowdownPauseTests(APITestCase):
	"""The pause between hands, which is also the window for showing cards."""

	def setUp(self):
		self.user = User.objects.create_user(username="pause_host", password="secret123", is_staff=True)
		self.client.force_authenticate(self.user)

	def tearDown(self):
		_tournament_runners.clear()

	def test_five_seconds_unless_asked_otherwise(self):
		response = self.client.post(reverse("tournament-list"), {"name": "Default"}, format="json")

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(Tournament.objects.get(id=response.data["id"]).showdown_seconds, 5)

	def test_a_host_can_set_it(self):
		response = self.client.post(
			reverse("tournament-list"), {"name": "Slow", "showdown_seconds": 12}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(Tournament.objects.get(id=response.data["id"]).showdown_seconds, 12)

	def test_too_short_to_read_is_refused(self):
		response = self.client.post(
			reverse("tournament-list"), {"name": "Blink", "showdown_seconds": 1}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("showdown_seconds", response.data)

	def test_a_pause_that_stops_being_one_is_refused(self):
		response = self.client.post(
			reverse("tournament-list"), {"name": "Forever", "showdown_seconds": 120}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ShowdownPauseLengthTests(TestCase):
	"""What the engine does with the configured pause."""

	def _coordinator(self, **kwargs):
		async def noop(*args, **kwargs):
			return None

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
			persist_player_states=noop,
			**kwargs,
		)

	def test_the_tournaments_setting_is_what_the_table_waits(self):
		self.assertEqual(self._coordinator(showdown_seconds=9).showdown_seconds, 9)

	def test_a_tournament_that_says_nothing_gets_the_default(self):
		coordinator = self._coordinator()
		self.assertEqual(coordinator.showdown_seconds, coordinator.INTER_HAND_SECONDS)

	def test_a_nonsense_setting_cannot_make_the_table_not_wait(self):
		# Validation refuses this on the way in; the engine still refuses to
		# deal straight over the previous hand if one ever reaches it.
		self.assertGreaterEqual(self._coordinator(showdown_seconds=0).showdown_seconds, 1)

	def test_showing_a_card_buys_a_whole_pause_to_look_at_it(self):
		from game.engine.card import Card, Rank, Suit

		coordinator = self._coordinator(showdown_seconds=8)
		player = EnginePlayer(name="p", chips=100)
		player._tp_id = 1
		player._user_id = 11
		player._seat = 1
		player._table_number = 1
		player.hole_cards = [Card(Rank.ACE, Suit.SPADES), Card(Rank.KING, Suit.HEARTS)]
		coordinator._players_by_id[1] = player
		coordinator._players_by_user_id[11] = player
		coordinator._show_open = True
		coordinator._show_deadline = time.monotonic() + 0.1

		async_to_sync(coordinator.show_cards)(11, [0])

		self.assertGreater(coordinator._show_deadline - time.monotonic(), 7)


class KnockoutAnnouncementTests(TestCase):
	"""Who gets named, and whose finisher plays, when a hand ends somebody."""

	def _coordinator(self, broadcasts):
		async def noop(*args, **kwargs):
			return None

		async def capture(table_number, event_type, payload):
			broadcasts.append((event_type, payload))

		return MultiTableTournamentCoordinator(
			tournament_id=1,
			players_per_table=9,
			levels=[{"small_blind": 25, "big_blind": 50, "ante": 0, "duration_hands": 8}],
			broadcast_tournament=noop,
			broadcast_table=capture,
			request_action=noop,
			notify_user=noop,
			load_players=noop,
			persist_assignments=noop,
			persist_player_states=noop,
		)

	def _player(self, coordinator, tp_id, name, gif=None):
		player = EnginePlayer(name=name, chips=1000)
		player._tp_id = tp_id
		player._user_id = tp_id * 11
		player._seat = tp_id
		player._global_seat = tp_id
		player._table_number = 1
		player._finisher_gif_id = gif
		coordinator._players_by_id[tp_id] = player
		coordinator._players_by_user_id[player._user_id] = player
		return player

	def test_a_split_pot_knockout_is_one_event_naming_both(self):
		"""Sent per eliminator, the second finisher landed on top of the first
		in the same instant and only the last one ever played."""
		broadcasts = []
		coordinator = self._coordinator(broadcasts)
		victim = self._player(coordinator, 1, "victim")
		one = self._player(coordinator, 2, "one", gif="aaa")
		two = self._player(coordinator, 3, "two", gif="bbb")

		async_to_sync(coordinator._announce_knockout)(victim, [one, two])

		self.assertEqual(len(broadcasts), 1)
		event_type, payload = broadcasts[0]
		self.assertEqual(event_type, "player_knockout")
		self.assertEqual(payload["victim_name"], "victim")
		self.assertEqual(
			[(e["name"], e["finisher_gif_id"]) for e in payload["eliminators"]],
			[("one", "aaa"), ("two", "bbb")],
		)

	def test_an_eliminator_without_a_finisher_is_still_named(self):
		broadcasts = []
		coordinator = self._coordinator(broadcasts)
		victim = self._player(coordinator, 1, "victim")
		one = self._player(coordinator, 2, "one", gif="aaa")
		two = self._player(coordinator, 3, "two")

		async_to_sync(coordinator._announce_knockout)(victim, [one, two])

		_, payload = broadcasts[0]
		self.assertEqual(len(payload["eliminators"]), 2)
		self.assertIsNone(payload["eliminators"][1]["finisher_gif_id"])

	def test_a_knockout_with_nobody_to_credit_says_nothing(self):
		broadcasts = []
		coordinator = self._coordinator(broadcasts)
		victim = self._player(coordinator, 1, "victim")

		async_to_sync(coordinator._announce_knockout)(victim, [])

		self.assertEqual(broadcasts, [])


class RebuySeatVisibilityTests(TestCase):
	"""A rebuy you cannot see looks like a rebuy that did not work."""

	def _coordinator(self, broadcasts):
		async def noop(*args, **kwargs):
			return None

		async def capture(table_number, event_type, payload):
			broadcasts.append((table_number, event_type, payload))

		async def assignments(layout, active_table_numbers):
			# What the real one hands back: the table rows it wrote.
			return {number: {"id": number, "max_seats": 9} for number in active_table_numbers}

		coordinator = MultiTableTournamentCoordinator(
			tournament_id=1,
			players_per_table=9,
			levels=[{"small_blind": 25, "big_blind": 50, "ante": 0, "duration_hands": 8}],
			broadcast_tournament=noop,
			broadcast_table=capture,
			request_action=noop,
			notify_user=noop,
			load_players=noop,
			persist_assignments=assignments,
			persist_player_states=noop,
		)
		return coordinator

	def _player(self, coordinator, tp_id, seat, chips=1000, eliminated=False):
		from game.coordinator import RuntimeTable

		player = EnginePlayer(name=f"p{tp_id}", chips=chips)
		player._tp_id = tp_id
		player._user_id = tp_id * 11
		player._seat = seat
		player._global_seat = seat
		player._table_number = 1
		player.is_eliminated = eliminated
		coordinator._players_by_id[tp_id] = player
		coordinator._players_by_user_id[player._user_id] = player
		table = coordinator._tables.setdefault(1, RuntimeTable(table_number=1, max_seats=9))
		if not eliminated:
			table.players.append(player)
		return player

	def test_a_rebought_player_appears_at_the_table_straight_away(self):
		broadcasts = []
		coordinator = self._coordinator(broadcasts)
		self._player(coordinator, 1, 0)
		self._player(coordinator, 2, 1)
		busted = self._player(coordinator, 3, 2, chips=0, eliminated=True)

		async_to_sync(coordinator.apply_rebuy)(33, 10_000)

		rosters = [payload for _, event, payload in broadcasts if event == "table_players"]
		self.assertTrue(rosters)
		names = [entry["name"] for entry in rosters[-1]["players"]]
		self.assertIn(busted.name, names)

	def test_they_are_shown_as_waiting_rather_than_in_the_hand(self):
		broadcasts = []
		coordinator = self._coordinator(broadcasts)
		self._player(coordinator, 1, 0)
		busted = self._player(coordinator, 2, 1, chips=0, eliminated=True)

		async_to_sync(coordinator.apply_rebuy)(22, 10_000)

		roster = [p for _, event, payload in broadcasts if event == "table_players"
				  for p in payload["players"]]
		waiting = next(entry for entry in roster if entry["name"] == busted.name)
		self.assertTrue(waiting["is_waiting"])
		# Everyone already in the hand is unaffected.
		seated = next(entry for entry in roster if entry["name"] == "p1")
		self.assertFalse(seated["is_waiting"])

	def test_the_running_hand_is_not_dealt_a_new_player_halfway_through(self):
		broadcasts = []
		coordinator = self._coordinator(broadcasts)
		self._player(coordinator, 1, 0)
		self._player(coordinator, 2, 1)
		self._player(coordinator, 3, 2, chips=0, eliminated=True)
		before = list(coordinator._tables[1].players)

		async_to_sync(coordinator.apply_rebuy)(33, 10_000)

		# Only the broadcast roster grows; the table's own list is what a hand
		# in progress is being played from.
		self.assertEqual(coordinator._tables[1].players, before)

	def test_they_take_a_free_seat_rather_than_somebody_elses(self):
		broadcasts = []
		coordinator = self._coordinator(broadcasts)
		self._player(coordinator, 1, 0)
		self._player(coordinator, 2, 1)
		busted = self._player(coordinator, 3, 0, chips=0, eliminated=True)

		async_to_sync(coordinator.apply_rebuy)(33, 10_000)

		self.assertNotIn(busted._seat, (0, 1))

	def test_the_next_deal_stops_them_reading_as_waiting(self):
		broadcasts = []
		coordinator = self._coordinator(broadcasts)
		self._player(coordinator, 1, 0)
		busted = self._player(coordinator, 2, 1, chips=0, eliminated=True)
		async_to_sync(coordinator.apply_rebuy)(22, 10_000)
		self.assertTrue(busted._waiting_for_hand)

		async_to_sync(coordinator._rebalance_tables)()

		self.assertFalse(busted._waiting_for_hand)


class DeletePausedTournamentTests(APITestCase):
	"""A night that breaks up half way through should not leave a game nobody
	can get rid of."""

	def setUp(self):
		self.host = User.objects.create_user(username="del_host", password="secret123", is_staff=True)
		self.other = User.objects.create_user(username="del_other", password="secret123")
		self.client.force_authenticate(self.host)

	def tearDown(self):
		_tournament_runners.clear()

	def _tournament(self, status_value):
		return Tournament.objects.create(host=self.host, name="Night", status=status_value)

	def test_the_host_can_delete_a_paused_tournament(self):
		tournament = self._tournament("paused")

		response = self.client.delete(reverse("tournament-delete", args=[tournament.id]))

		self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
		self.assertFalse(Tournament.objects.filter(id=tournament.id).exists())

	def test_deleting_a_paused_tournament_stops_its_engine_first(self):
		"""Left running, it wakes up and writes to rows that are not there."""
		tournament = self._tournament("paused")
		_tournament_runners[tournament.id] = object()

		response = self.client.delete(reverse("tournament-delete", args=[tournament.id]))

		self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
		self.assertNotIn(tournament.id, _tournament_runners)

	def test_a_running_tournament_is_still_refused(self):
		tournament = self._tournament("running")

		response = self.client.delete(reverse("tournament-delete", args=[tournament.id]))

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertTrue(Tournament.objects.filter(id=tournament.id).exists())

	def test_a_finished_tournament_is_still_refused(self):
		tournament = self._tournament("finished")

		response = self.client.delete(reverse("tournament-delete", args=[tournament.id]))

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_only_the_host_can_delete_a_paused_tournament(self):
		tournament = self._tournament("paused")
		self.client.force_authenticate(self.other)

		response = self.client.delete(reverse("tournament-delete", args=[tournament.id]))

		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
		self.assertTrue(Tournament.objects.filter(id=tournament.id).exists())


class RebuyWindowTests(TestCase):
	"""Being offered a rebuy on a screen that arrives once the next hand has
	started is the same as not being offered one."""

	def _coordinator(self, broadcasts=None, **kwargs):
		async def noop(*args, **kwargs):
			return None

		async def capture(event_type, payload):
			if broadcasts is not None:
				broadcasts.append((event_type, payload))

		settings = dict(allow_rebuys=True, max_rebuys=2, rebuy_level=4)
		settings.update(kwargs)
		return MultiTableTournamentCoordinator(
			tournament_id=1,
			players_per_table=9,
			levels=[{"small_blind": 25, "big_blind": 50, "ante": 0, "duration_hands": 8}],
			broadcast_tournament=capture,
			broadcast_table=noop,
			request_action=noop,
			notify_user=noop,
			load_players=noop,
			persist_assignments=noop,
			persist_player_states=noop,
			**settings,
		)

	def _busted(self, coordinator, tp_id=1, rebuys_used=0):
		player = EnginePlayer(name=f"p{tp_id}", chips=0)
		player._tp_id = tp_id
		player._user_id = tp_id * 11
		player._seat = tp_id
		player._table_number = 1
		player._rebuy_count = rebuys_used
		player.is_eliminated = True
		coordinator._players_by_id[tp_id] = player
		coordinator._players_by_user_id[player._user_id] = player
		return player

	def test_busting_out_holds_the_table_and_asks(self):
		broadcasts = []
		coordinator = self._coordinator(broadcasts)
		player = self._busted(coordinator)

		async_to_sync(coordinator._offer_rebuys)([player])

		event_type, payload = broadcasts[-1]
		self.assertEqual(event_type, "rebuy_window")
		self.assertEqual(payload["user_ids"], [11])
		self.assertGreater(coordinator._rebuy_deadline - time.monotonic(), 5)

	def test_nothing_is_held_when_rebuys_are_off(self):
		broadcasts = []
		coordinator = self._coordinator(broadcasts, allow_rebuys=False)
		player = self._busted(coordinator)

		async_to_sync(coordinator._offer_rebuys)([player])

		self.assertEqual(broadcasts, [])
		self.assertEqual(coordinator._rebuy_deadline, 0.0)

	def test_a_player_out_of_rebuys_is_not_waited_for(self):
		broadcasts = []
		coordinator = self._coordinator(broadcasts, max_rebuys=1)
		player = self._busted(coordinator, rebuys_used=1)

		async_to_sync(coordinator._offer_rebuys)([player])

		self.assertEqual(broadcasts, [])

	def test_the_table_does_not_wait_once_the_rebuy_period_has_closed(self):
		broadcasts = []
		coordinator = self._coordinator(broadcasts, rebuy_level=1)
		# Four levels, so the index below really is the fourth blind level —
		# current_blind_level_number clamps to the last level that exists.
		coordinator.levels = [
			{"small_blind": 25, "big_blind": 50, "ante": 0, "duration_hands": 8}
			for _ in range(4)
		]
		coordinator._level_index = 3   # level 4, past the cutoff
		player = self._busted(coordinator)

		async_to_sync(coordinator._offer_rebuys)([player])

		self.assertEqual(broadcasts, [])

	def test_the_wait_ends_as_soon_as_everybody_has_decided(self):
		coordinator = self._coordinator([])
		player = self._busted(coordinator)
		async_to_sync(coordinator._offer_rebuys)([player])
		self.assertTrue(coordinator._rebuy_pending)

		async_to_sync(coordinator.apply_rebuy)(11, 10_000)

		self.assertEqual(coordinator._rebuy_pending, set())
		self.assertEqual(coordinator._rebuy_deadline, 0.0)

	def test_two_players_busting_together_are_both_asked(self):
		broadcasts = []
		coordinator = self._coordinator(broadcasts)
		first = self._busted(coordinator, 1)
		second = self._busted(coordinator, 2)

		async_to_sync(coordinator._offer_rebuys)([first, second])

		_, payload = broadcasts[-1]
		self.assertEqual(payload["user_ids"], [11, 22])
		# And one of them coming back does not end the other's window.
		async_to_sync(coordinator.apply_rebuy)(11, 10_000)
		self.assertEqual(coordinator._rebuy_pending, {22})
		self.assertGreater(coordinator._rebuy_deadline, 0.0)


class EditTournamentTests(APITestCase):
	"""Fixing a tournament nobody has played yet — but not the terms people
	joined on."""

	def setUp(self):
		self.host = User.objects.create_user(username="edit_host", password="secret123", is_staff=True)
		self.other = User.objects.create_user(username="edit_other", password="secret123")
		self.client.force_authenticate(self.host)
		response = self.client.post(reverse("tournament-list"), {
			"name": "Weekly",
			"starting_chips": 10000,
			"buy_in_cents": 2000,
			"payout_structure": [{"place": 1, "label": "1st", "percentage": 100}],
			"bounty_mode": "progressive",
			"bounty_cents": 1000,
		}, format="json")
		self.tournament = Tournament.objects.get(id=response.data["id"])

	def tearDown(self):
		_tournament_runners.clear()

	def _edit(self, **payload):
		return self.client.patch(
			reverse("tournament-edit", args=[self.tournament.id]), payload, format="json",
		)

	def test_the_host_can_change_the_arrangements(self):
		response = self._edit(name="Weekly (moved)", showdown_seconds=9, starting_chips=25000)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.tournament.refresh_from_db()
		self.assertEqual(self.tournament.name, "Weekly (moved)")
		self.assertEqual(self.tournament.showdown_seconds, 9)
		self.assertEqual(self.tournament.starting_chips, 25000)

	def test_players_already_seated_get_the_new_stack(self):
		"""Nobody has played, so leaving them on the old one would seat them
		with different chips to everybody else."""
		self._edit(starting_chips=25000)

		self.assertEqual(self.tournament.players.get().chips, 25000)

	def test_the_buy_in_cannot_be_moved_behind_the_players(self):
		self._edit(buy_in_cents=9999)

		self.tournament.refresh_from_db()
		self.assertEqual(self.tournament.buy_in_cents, 2000)

	def test_editing_something_else_does_not_wipe_the_payouts(self):
		"""The create serializer defaults an absent payout structure to empty,
		which would have cleared it on every unrelated edit."""
		self._edit(name="Weekly II")

		self.tournament.refresh_from_db()
		self.assertEqual(len(self.tournament.payout_structure), 1)
		self.assertEqual(self.tournament.bounty_mode, "progressive")
		self.assertEqual(self.tournament.bounty_cents, 1000)

	def test_the_blind_structure_can_be_replaced(self):
		response = self._edit(levels=[
			{"small_blind": 100, "big_blind": 200, "ante": 0, "duration_minutes": 12},
			{"small_blind": 200, "big_blind": 400, "ante": 50, "duration_minutes": 12},
		])

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(self.tournament.levels.count(), 2)
		self.assertEqual(self.tournament.levels.first().big_blind, 200)

	def test_shortening_the_structure_pulls_the_cutoffs_in_with_it(self):
		"""Refusing the edit because a leftover cutoff points past the new last
		level is no help to a host who just shortened the tournament."""
		self._edit(levels=[
			{"small_blind": 100, "big_blind": 200, "ante": 0, "duration_minutes": 12},
			{"small_blind": 200, "big_blind": 400, "ante": 50, "duration_minutes": 12},
		])

		self.tournament.refresh_from_db()
		self.assertLessEqual(self.tournament.late_reg_level, 2)
		self.assertLessEqual(self.tournament.rebuy_level, 2)

	def test_the_cap_cannot_drop_below_the_players_already_seated(self):
		response = self._edit(max_players=0)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_a_tournament_under_way_cannot_be_edited(self):
		Tournament.objects.filter(id=self.tournament.id).update(status="running")

		response = self._edit(name="too late")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_only_the_host_can_edit(self):
		self.client.force_authenticate(self.other)

		response = self._edit(name="not yours")

		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

	def test_the_game_type_is_recorded(self):
		self.assertEqual(self.tournament.game_type, "nlh")
