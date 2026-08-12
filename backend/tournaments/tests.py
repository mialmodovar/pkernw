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
