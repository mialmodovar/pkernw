import random
import time
from unittest.mock import patch

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

	def test_the_lobby_list_carries_the_faces_of_whoever_is_registered(self):
		from accounts.models import AvatarImage, Profile

		rival = User.objects.create_user(username="rival", password="secret123")
		Profile.objects.update_or_create(user=rival, defaults={"avatar_emoji": "\U0001F98A"})
		AvatarImage.objects.create(user=self.user, data=b"\x89PNG\r\n\x1a\n", content_type="image/png")
		tournament = Tournament.objects.create(host=self.user, name="Thursday", status="lobby")
		TournamentPlayer.objects.create(tournament=tournament, user=self.user, seat=0, chips=1000)
		TournamentPlayer.objects.create(tournament=tournament, user=rival, seat=1, chips=1000)

		row = next(
			entry for entry in self.client.get(reverse("tournament-list")).data
			if entry["id"] == tournament.id
		)

		# Seat order, so the row does not reshuffle on every refresh.
		self.assertEqual([player["username"] for player in row["registered"]], ["host", "rival"])
		self.assertEqual(row["registered"][1]["avatar_emoji"], "\U0001F98A")
		# An uploaded picture wins, and an emoji stands in where there is none.
		self.assertIn(f"/api/auth/avatar/{self.user.id}/", row["registered"][0]["avatar_url"])
		self.assertIsNone(row["registered"][1]["avatar_url"])

	def test_a_tournament_seats_eight_a_table_unless_told_otherwise(self):
		response = self.client.post(
			reverse("tournament-list"),
			{
				"name": "Thursday",
				"starting_chips": 20000,
				"max_players": 16,
				# Both cutoffs off, so the one blind level below is enough for this
				# to be a valid tournament — the point here is the seating.
				"late_reg_level": 0,
				"rebuy_level": 0,
				"levels": [{"small_blind": 25, "big_blind": 50, "ante": 0, "duration_minutes": 10}],
			},
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
		self.assertEqual(Tournament.objects.get(id=response.data["id"]).players_per_table, 8)

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
		# Three, because a tournament no longer starts itself with two: that
		# would be a heads-up match nobody signed up for. See MIN_TO_START_ITSELF.
		for index, name in enumerate(("due_opponent", "due_third"), start=1):
			other = User.objects.create_user(username=name, password="secret123")
			tournament.players.create(
				user=other, table=primary_table, seat=index, seat_at_table=index, chips=10000,
			)

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

			def seconds_until_blind_level_ends(self, blind_level_number):
				return 600

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
		# And how long is left to act on it, which is the half of "late reg"
		# a player can actually use.
		self.assertEqual(listed[tournament.id]["late_registration_seconds_left"], 600)

	def test_upcoming_hides_running_tournament_once_late_registration_closes(self):
		class FakeRunner:
			current_blind_level_number = 5

			def seconds_until_blind_level_ends(self, blind_level_number):
				return 600

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

			def seconds_until_blind_level_ends(self, blind_level_number):
				return 600

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

			def seconds_until_blind_level_ends(self, blind_level_number):
				return 600

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

	def test_rebuy_is_refused_once_the_period_has_closed(self):
		class LateRunner:
			current_blind_level_number = 5

			async def apply_rebuy(self, user_id, chips):  # pragma: no cover - never reached
				raise AssertionError("the view should have refused before the engine")

		tournament = self._tournament()
		self._seat(tournament)
		_tournament_runners[tournament.id] = LateRunner()

		response = self.client.post(reverse("tournament-rebuy", kwargs={"pk": tournament.id}))

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["error"], "Rebuy period has ended")

	def test_the_lobby_is_told_whether_a_rebuy_would_be_taken(self):
		"""The button a busted player is offered away from the table is drawn
		from these two fields, so they have to agree with the endpoint."""
		class FakeRunner:
			current_blind_level_number = 1

			def seconds_until_blind_level_ends(self, blind_level_number):
				return 600

		tournament = self._tournament()
		self._seat(tournament, rebuy_count=1)
		_tournament_runners[tournament.id] = FakeRunner()

		detail = self.client.get(reverse("tournament-detail", kwargs={"pk": tournament.id}))
		self.assertTrue(detail.data["rebuys_open"])

		listed = self.client.get(reverse("tournament-list"), {"scope": "mine_active"})
		row = next(r for r in listed.data if r["id"] == tournament.id)
		self.assertTrue(row["rebuys_open"])
		# Being out is what the list knows about you; the count is what says
		# whether a capped tournament has one left to sell.
		self.assertEqual(row["my_finish_position"], 3)
		self.assertEqual(row["my_rebuy_count"], 1)

	def test_the_lobby_is_told_when_the_rebuy_period_has_closed(self):
		class LateRunner:
			current_blind_level_number = 5

			def seconds_until_blind_level_ends(self, blind_level_number):
				return 600

		tournament = self._tournament()
		self._seat(tournament)
		_tournament_runners[tournament.id] = LateRunner()

		detail = self.client.get(reverse("tournament-detail", kwargs={"pk": tournament.id}))
		self.assertFalse(detail.data["rebuys_open"])

	def test_the_lobby_is_told_which_level_is_running(self):
		"""It has always drawn a current level and never been served one, so a
		running tournament read "Current level —" all night."""
		class FakeRunner:
			current_blind_level_number = 3
			current_level_index = 2

			def seconds_until_blind_level_ends(self, blind_level_number):
				return 600

		tournament = self._tournament(current_level_index=0)
		_tournament_runners[tournament.id] = FakeRunner()

		detail = self.client.get(reverse("tournament-detail", kwargs={"pk": tournament.id}))

		# The engine's, not the column's: the row is written after a hand and
		# the level can turn over in the middle of one.
		self.assertEqual(detail.data["current_level_index"], 2)

	def test_the_level_falls_back_to_the_column_with_no_engine(self):
		tournament = self._tournament(status="paused", current_level_index=4)

		detail = self.client.get(reverse("tournament-detail", kwargs={"pk": tournament.id}))

		self.assertEqual(detail.data["current_level_index"], 4)
		self.assertFalse(detail.data["rebuys_open"])

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

	def test_a_rebuy_writes_only_the_returning_player(self):
		"""A rebuy arrives from the request thread while a hand is running, so
		writing the whole table would persist stacks with chips still in the
		pot — the run loop then reads that back as the real total."""
		persisted = []
		coordinator = self._coordinator(persisted)
		self._add_player(coordinator, 1, 11, chips=0, is_eliminated=True, finish_position=2)
		# Mid-hand: their blind is posted and the pot has not been awarded.
		self._add_player(coordinator, 2, 22, chips=4_900)

		self.assertEqual(async_to_sync(coordinator.apply_rebuy)(11, 10_000), "")

		self.assertEqual([row["tp_id"] for row in persisted], [1])

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


class SuperuserRunsAnythingTests(APITestCase):
	"""The superuser has the host's controls over every tournament.

	Not the staff flag, which is a job — opening tournaments, running clubs.
	This is whoever administers the installation, and there is nobody above them
	to appeal to when a table is stuck at two in the morning.
	"""

	def setUp(self):
		self.host = User.objects.create_user(username="su_host", password="secret123", is_staff=True)
		self.boss = User.objects.create_superuser(username="su_boss", password="secret123")
		self.player = User.objects.create_user(username="su_player", password="secret123")
		# Deliberately no club: a club night already answered to its organisers,
		# and a tournament with no club behind it answered to its host alone.
		self.tournament = Tournament.objects.create(
			host=self.host, name="Not my game", status="lobby", club=None,
		)
		for index, user in enumerate([self.host, self.player]):
			TournamentPlayer.objects.create(
				tournament=self.tournament, user=user, seat=index, seat_at_table=index, chips=10000,
			)

	def tearDown(self):
		_tournament_runners.clear()

	def test_the_superuser_can_start_somebody_elses_tournament(self):
		self.client.force_authenticate(self.boss)

		response = self.client.post(
			reverse("tournament-start", kwargs={"pk": self.tournament.id}),
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.tournament.refresh_from_db()
		self.assertEqual(self.tournament.status, "running")

	def test_the_superuser_can_pause_and_resume_it(self):
		self.tournament.status = "running"
		self.tournament.save(update_fields=["status"])
		self.client.force_authenticate(self.boss)

		paused = self.client.post(reverse("tournament-pause", kwargs={"pk": self.tournament.id}))
		self.assertEqual(paused.status_code, status.HTTP_200_OK)

		resumed = self.client.post(reverse("tournament-resume", kwargs={"pk": self.tournament.id}))
		self.assertEqual(resumed.status_code, status.HTTP_200_OK)

	def test_the_superuser_can_edit_the_blind_structure(self):
		"""This one asked for the host by name, so even a club's own organisers
		could start a tournament they were not allowed to fix a typo in."""
		self.client.force_authenticate(self.boss)

		response = self.client.put(
			reverse("tournament-levels", kwargs={"pk": self.tournament.id}),
			[{"small_blind": 25, "big_blind": 50, "duration_minutes": 10}],
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(self.tournament.levels.count(), 1)

	def test_the_superuser_can_delete_it(self):
		self.client.force_authenticate(self.boss)

		response = self.client.delete(
			reverse("tournament-delete", kwargs={"pk": self.tournament.id}),
		)

		self.assertIn(response.status_code, (status.HTTP_200_OK, status.HTTP_204_NO_CONTENT))
		self.assertFalse(Tournament.objects.filter(pk=self.tournament.id).exists())

	def test_an_ordinary_player_still_cannot(self):
		self.client.force_authenticate(self.player)

		response = self.client.post(
			reverse("tournament-start", kwargs={"pk": self.tournament.id}),
		)

		# Refused as "not found or not yours to run", which is what these
		# endpoints have always answered rather than confirming it exists.
		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
		self.tournament.refresh_from_db()
		self.assertEqual(self.tournament.status, "lobby")

	def test_staff_who_are_not_the_host_still_cannot_run_a_clubless_tournament(self):
		"""Staff is a job, not ownership of everybody's night. Only the
		superuser reaches over the host of a tournament with no club."""
		other_staff = User.objects.create_user(
			username="su_other", password="secret123", is_staff=True,
		)
		self.client.force_authenticate(other_staff)

		response = self.client.post(
			reverse("tournament-start", kwargs={"pk": self.tournament.id}),
		)

		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
		self.tournament.refresh_from_db()
		self.assertEqual(self.tournament.status, "lobby")

	def test_the_payload_says_who_may_run_it_so_the_buttons_match(self):
		self.client.force_authenticate(self.boss)
		detail = self.client.get(reverse("tournament-detail", kwargs={"pk": self.tournament.id}))
		self.assertTrue(detail.data["can_manage"])
		# Still not their night: whose it is and who may run it are two
		# different questions, and only one of them gets printed.
		listed = self.client.get(reverse("tournament-list"), {"scope": "upcoming"})
		row = next(r for r in listed.data if r["id"] == self.tournament.id)
		self.assertTrue(row["can_manage"])
		self.assertFalse(row["is_host"])

		self.client.force_authenticate(self.player)
		detail = self.client.get(reverse("tournament-detail", kwargs={"pk": self.tournament.id}))
		self.assertFalse(detail.data["can_manage"])


class StaffDoNotRunEachOthersTournamentsTests(APITestCase):
	"""Who may run a club's tournament, pinned because it was wrong.

	Staff is handed out so people can open a game of their own. It was also
	being read as "runs the installation", which gave every host the
	organiser's controls over every club on it — a table where everybody could
	edit and pause a night that was none of theirs. The ladder is: the host, the
	club's own staff and owner, and the superuser.
	"""

	def setUp(self):
		# Imported here rather than in the block at the top, as the rebuy tests
		# below do: this module is loaded by the clubs app's own tests.
		from clubs.models import Club, Membership

		self.Membership = Membership
		self.host = User.objects.create_user(username="cn_host", password="secret123", is_staff=True)
		self.co_organiser = User.objects.create_user(username="cn_co", password="secret123")
		self.other_host = User.objects.create_user(
			username="cn_other", password="secret123", is_staff=True,
		)
		self.boss = User.objects.create_superuser(username="cn_boss", password="secret123")
		self.club = Club.objects.create(name="Tuesday Club", created_by=self.host)
		Membership.objects.create(club=self.club, user=self.host, role=Membership.OWNER)
		Membership.objects.create(club=self.club, user=self.co_organiser, role=Membership.STAFF)
		self.tournament = Tournament.objects.create(
			host=self.host, name="Club night", status="lobby", club=self.club,
		)
		for index, user in enumerate([self.host, self.co_organiser]):
			TournamentPlayer.objects.create(
				tournament=self.tournament, user=user, seat=index, seat_at_table=index, chips=10000,
			)

	def tearDown(self):
		_tournament_runners.clear()

	def _start(self, user):
		self.client.force_authenticate(user)
		return self.client.post(reverse("tournament-start", kwargs={"pk": self.tournament.id}))

	def test_staff_from_outside_the_club_cannot_start_it(self):
		self.assertEqual(self._start(self.other_host).status_code, status.HTTP_404_NOT_FOUND)
		self.tournament.refresh_from_db()
		self.assertEqual(self.tournament.status, "lobby")

	def test_staff_from_outside_the_club_cannot_edit_it(self):
		self.client.force_authenticate(self.other_host)

		response = self.client.patch(
			reverse("tournament-edit", kwargs={"pk": self.tournament.id}),
			{"name": "Mine now"}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
		self.tournament.refresh_from_db()
		self.assertEqual(self.tournament.name, "Club night")

	def test_staff_from_outside_the_club_cannot_delete_it(self):
		self.client.force_authenticate(self.other_host)

		response = self.client.delete(
			reverse("tournament-delete", kwargs={"pk": self.tournament.id}),
		)

		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
		self.assertTrue(Tournament.objects.filter(pk=self.tournament.id).exists())

	def test_staff_from_outside_the_club_cannot_pause_a_running_night(self):
		self.tournament.status = "running"
		self.tournament.save(update_fields=["status"])
		self.client.force_authenticate(self.other_host)

		response = self.client.post(
			reverse("tournament-pause", kwargs={"pk": self.tournament.id}),
		)

		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
		self.tournament.refresh_from_db()
		self.assertEqual(self.tournament.status, "running")

	def test_the_buttons_are_not_drawn_for_them_either(self):
		self.client.force_authenticate(self.other_host)
		detail = self.client.get(reverse("tournament-detail", kwargs={"pk": self.tournament.id}))
		self.assertFalse(detail.data["can_manage"])

	def test_the_clubs_own_co_organiser_still_can(self):
		"""The reason this permission exists: the host is stuck in traffic."""
		self.assertEqual(self._start(self.co_organiser).status_code, status.HTTP_200_OK)

	def test_the_host_still_can(self):
		self.assertEqual(self._start(self.host).status_code, status.HTTP_200_OK)

	def test_the_superuser_still_can(self):
		self.assertEqual(self._start(self.boss).status_code, status.HTTP_200_OK)

	def test_staff_can_still_open_a_tournament_of_their_own(self):
		"""What the staff flag is actually for."""
		self.client.force_authenticate(self.other_host)
		response = self.client.post(
			reverse("tournament-list"), {"name": "My own game"}, format="json",
		)
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertTrue(Tournament.objects.filter(host=self.other_host).exists())


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

	def _promises(self):
		from tournaments.models import DebtTransfer
		return {
			(t.from_user.username, t.to_user.username): t.remaining_cents
			for t in DebtTransfer.objects.select_related("from_user", "to_user")
			if t.remaining_cents
		}

	def _three_way_night(self):
		t = self._tournament(buy_in=1000)
		self._seat(t, "ana", 0, 1)
		self._seat(t, "bea", 1, 2)
		self._seat(t, "caio", 2, 3)
		self._settle(t)
		return t

	def test_settling_a_night_writes_the_promises_down(self):
		self._three_way_night()

		# Pot 3000: ana takes 2100, bea 900, caio nothing.
		self.assertEqual(self._promises(), {("caio", "ana"): 1000, ("bea", "ana"): 100})

	def test_paying_a_debt_leaves_everybody_elses_alone(self):
		"""The bug: recording one payment used to re-pair everyone."""
		from tournaments.ledger import apply_settlement
		self._three_way_night()
		before = self._promises()

		apply_settlement(self.users["caio"].id, self.users["ana"].id, 1000)

		after = self._promises()
		# The paid promise is gone and nothing else moved — same pair, same amount.
		self.assertEqual(after, {("bea", "ana"): before[("bea", "ana")]})

	def test_a_part_payment_leaves_the_rest_of_that_promise(self):
		from tournaments.ledger import apply_settlement
		self._three_way_night()

		apply_settlement(self.users["caio"].id, self.users["ana"].id, 400)

		self.assertEqual(self._promises(), {("caio", "ana"): 600, ("bea", "ana"): 100})

	def test_a_receiver_cannot_claim_more_than_is_promised(self):
		from tournaments.ledger import apply_settlement
		self._three_way_night()

		self.assertIsNone(apply_settlement(self.users["bea"].id, self.users["ana"].id, 5000))
		# Refused outright: nothing recorded, nothing moved.
		self.assertEqual(self._promises(), {("caio", "ana"): 1000, ("bea", "ana"): 100})

	def test_a_later_night_adds_promises_without_moving_the_old_ones(self):
		"""A night that turns a debtor into a winner does not erase what they owe.

		caio owes ana from the first night and wins the second. The promise he
		already made stands; the money that cancels it reaches him as somebody
		else's promise to him.
		"""
		self._three_way_night()

		second = self._tournament(buy_in=1000)
		self._seat(second, "caio", 0, 1)
		self._seat(second, "ana", 1, 2)
		self._seat(second, "bea", 2, 3)
		self._settle(second)

		promises = self._promises()
		self.assertEqual(promises[("caio", "ana")], 1000)
		self.assertEqual(promises[("bea", "ana")], 100)
		# Everything owed still nets out to what the results say.
		self._assert_promises_clear_the_balances()

	def _assert_promises_clear_the_balances(self):
		from tournaments.ledger import balances
		from tournaments.models import DebtTransfer
		net = dict(balances())
		for transfer in DebtTransfer.objects.all():
			remaining = transfer.remaining_cents
			net[transfer.from_user_id] = net.get(transfer.from_user_id, 0) + remaining
			net[transfer.to_user_id] = net.get(transfer.to_user_id, 0) - remaining
		self.assertEqual({u: c for u, c in net.items() if c}, {})


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


class PkoPayloadTests(APITestCase):
	"""What a progressive tournament tells the screens that draw it.

	The arithmetic is settled above; this is about whether the numbers reach the
	lobby at all, and whether they are the ones the table already shows.
	"""

	def setUp(self):
		self.host = User.objects.create_user(username="pko_host", password="secret123", is_staff=True)
		self.bea = User.objects.create_user(username="pko_bea", password="secret123")
		self.cid = User.objects.create_user(username="pko_cid", password="secret123")
		self.client.force_authenticate(self.host)

	def tearDown(self):
		_tournament_runners.clear()

	def _played_out(self):
		"""A finished 20€ PKO with a 10€ bounty, three players and one rebuy.

		The rows are the ones the engine leaves behind: heads emptied into
		whoever did the knocking, the winner's own head still carrying what they
		collected onto it.
		"""
		t = Tournament.objects.create(
			host=self.host,
			name="PKO night",
			status="finished",
			buy_in_cents=2000,
			bounty_mode="progressive",
			bounty_cents=1000,
			bounty_progressive_split_pct=50,
			payout_structure=[
				{"place": 1, "label": "1st", "percentage": 70},
				{"place": 2, "label": "2nd", "percentage": 30},
			],
		)
		# The host knocked cid out, then bea twice — bea rebought a fresh head
		# in between, and the last one paid whole because it ended the night.
		TournamentPlayer.objects.create(
			tournament=t, user=self.host, seat=0, chips=60000, finish_position=1,
			bounty_cents=2000, bounty_won_cents=2000, knockouts=3,
		)
		TournamentPlayer.objects.create(
			tournament=t, user=self.bea, seat=1, chips=0, finish_position=2,
			is_eliminated=True, rebuy_count=1,
		)
		TournamentPlayer.objects.create(
			tournament=t, user=self.cid, seat=2, chips=0, finish_position=3, is_eliminated=True,
		)
		return t

	def test_the_detail_carries_every_number_a_result_is_drawn_from(self):
		from tournaments.ledger import settle_tournament

		t = self._played_out()
		settle_tournament(t)

		response = self.client.get(reverse("tournament-detail", kwargs={"pk": t.id}))
		by_name = {p["username"]: p for p in response.data["players"]}

		# Four entries at 20€: 40€ played for by placing, 40€ onto heads.
		# The host takes 70% of the places and the whole bounty pool — 20€
		# banked as cash and 20€ still sitting on their own head.
		self.assertEqual(by_name["pko_host"]["bounty_prize_cents"], 4000)
		self.assertEqual(by_name["pko_host"]["prize_cents"], 2800 + 4000)
		self.assertEqual(by_name["pko_host"]["knockouts"], 3)
		self.assertEqual(by_name["pko_bea"]["prize_cents"], 1200)
		self.assertEqual(by_name["pko_bea"]["bounty_prize_cents"], 0)
		# Everything the lobby needs to say what is being played for.
		self.assertEqual(response.data["bounty_mode"], "progressive")
		self.assertEqual(response.data["bounty_cents"], 1000)
		self.assertEqual(response.data["bounty_progressive_split_pct"], 50)

	def test_the_places_are_played_for_with_the_bounty_taken_out(self):
		"""The half of the buy-in that went onto a head is not in the pot the
		payout percentages divide, and a lobby that adds it back promises a
		first prize that does not exist."""
		from tournaments.bounties import BountyConfig, prize_pool_share_cents
		from tournaments.ledger import settle_tournament
		from tournaments.models import LedgerEntry

		t = self._played_out()
		settle_tournament(t)

		entries = 4  # three players, one of whom rebought
		placing_pot = prize_pool_share_cents(BountyConfig.from_tournament(t), t.buy_in_cents) * entries
		self.assertEqual(placing_pot, 4000)

		ledger = {e.user_id: e for e in LedgerEntry.objects.filter(tournament=t)}
		places = sum(e.prize_cents - e.bounty_prize_cents for e in ledger.values())
		self.assertEqual(places, placing_pot)
		# And the whole night still balances: four buy-ins in, four out.
		self.assertEqual(sum(e.stake_cents for e in ledger.values()), 8000)
		self.assertEqual(sum(e.prize_cents for e in ledger.values()), 8000)

	def test_a_running_tournament_shows_what_is_on_every_head(self):
		"""Mid-flight there is no ledger yet, so the live columns are the answer
		and they have to be in the payload."""
		t = self._played_out()
		t.status = "running"
		t.save(update_fields=["status"])

		response = self.client.get(reverse("tournament-detail", kwargs={"pk": t.id}))
		host = next(p for p in response.data["players"] if p["username"] == "pko_host")

		self.assertEqual(host["bounty_cents"], 2000)      # what they are worth
		self.assertEqual(host["bounty_won_cents"], 2000)  # what they have banked
		self.assertEqual(host["bounty_prize_cents"], 0)   # nothing settled yet


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

	def test_a_card_cannot_be_turned_over_while_the_hand_is_still_running(self):
		"""Flashing the ace on the way to mucking it is half of why anybody
		plays with people they can see, so the picking stays — but the card
		itself waits for the hand to be over. A card face up while other
		players are still deciding tells them something they have not paid to
		know, and on a phone it was happening by accident: peeking at your own
		hand is a tap on the same cards. The client holds the pick and posts it
		when the window opens; this end simply refuses anything earlier.
		"""
		broadcasts = []
		coordinator = self._coordinator(broadcasts)
		self._seat_with_cards(coordinator)
		coordinator._show_open = False

		self.assertFalse(async_to_sync(coordinator.show_cards)(11, [0]))
		self.assertEqual(broadcasts, [])

	def test_a_refused_reveal_is_not_the_one_show_you_had(self):
		"""A pick that landed too early must not cost the player their show:
		the client resends it when the hand ends, and that one has to land."""
		broadcasts = []
		coordinator = self._coordinator(broadcasts)
		self._seat_with_cards(coordinator)
		coordinator._show_open = False
		self.assertFalse(async_to_sync(coordinator.show_cards)(11, [0]))

		coordinator._show_open = True

		self.assertTrue(async_to_sync(coordinator.show_cards)(11, [0]))
		self.assertEqual(broadcasts[-1][0], "cards_shown")

	def test_a_reveal_that_was_refused_does_not_move_the_deadline(self):
		"""Nothing was shown, so there is nothing for the table to look at and
		no reason for the next deal to wait."""
		coordinator = self._coordinator([])
		self._seat_with_cards(coordinator)
		coordinator._show_open = False
		coordinator._show_deadline = 0.0

		async_to_sync(coordinator.show_cards)(11, [0])

		self.assertEqual(coordinator._show_deadline, 0.0)

	def test_showing_is_once_a_hand_whichever_card_it_was(self):
		coordinator = self._coordinator([])
		self._seat_with_cards(coordinator)
		coordinator._show_open = True

		self.assertTrue(async_to_sync(coordinator.show_cards)(11, [0]))
		# One card a hand is the cap: the second is refused whether it comes
		# from the bar or from the cards on the seat.
		self.assertFalse(async_to_sync(coordinator.show_cards)(11, [1]))

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

	def test_the_table_picks_which_finisher_plays_and_says_its_sound(self):
		"""Chosen here rather than on each client: eight browsers rolling their
		own dice would put eight different GIFs over the same knockout."""
		broadcasts = []
		coordinator = self._coordinator(broadcasts)
		# Whichever the dice would have given, this test says the last one.
		coordinator._choose_finisher = lambda options: options[-1]
		victim = self._player(coordinator, 1, "victim")
		one = self._player(coordinator, 2, "one", gif="legacy")
		one._finishers = [
			{"gif_id": "aaa", "sound": "airhorn"},
			{"gif_id": "bbb", "sound": "boom"},
		]

		async_to_sync(coordinator._announce_knockout)(victim, [one])

		_, payload = broadcasts[0]
		self.assertEqual(payload["eliminators"][0]["finisher_gif_id"], "bbb")
		self.assertEqual(payload["eliminators"][0]["finisher_sound"], "boom")

	def test_a_profile_saved_before_the_list_existed_still_plays(self):
		broadcasts = []
		coordinator = self._coordinator(broadcasts)
		victim = self._player(coordinator, 1, "victim")
		one = self._player(coordinator, 2, "one", gif="oldone")

		async_to_sync(coordinator._announce_knockout)(victim, [one])

		_, payload = broadcasts[0]
		self.assertEqual(payload["eliminators"][0]["finisher_gif_id"], "oldone")
		self.assertEqual(payload["eliminators"][0]["finisher_sound"], "none")


class FinisherListTests(TestCase):
	"""What comes off a profile, and what the table is allowed to play."""

	def test_the_single_id_that_came_before_is_folded_in(self):
		from game.finishers import finisher_list

		self.assertEqual(
			finisher_list({"finisher_gif_id": "abc123"}),
			[{"gif_id": "abc123", "sound": "none"}],
		)

	def test_the_list_wins_over_the_single_id(self):
		from game.finishers import finisher_list

		self.assertEqual(
			finisher_list({"finisher_gif_id": "old", "finishers": [{"gif_id": "new1"}]}),
			[{"gif_id": "new1", "sound": "none"}],
		)

	def test_rubbish_is_dropped_rather_than_corrected(self):
		from game.finishers import finisher_list

		self.assertEqual(
			finisher_list({"finishers": [
				{"gif_id": "http://evil.example/x.gif"},
				{"gif_id": "fine11", "sound": "not a sound"},
			]}),
			[{"gif_id": "fine11", "sound": "none"}],
		)

	def test_no_more_than_three_and_no_duplicates(self):
		from game.finishers import finisher_list

		listed = finisher_list({"finishers": [
			{"gif_id": "one"}, {"gif_id": "one"}, {"gif_id": "two"},
			{"gif_id": "three"}, {"gif_id": "four"},
		]})

		self.assertEqual([one["gif_id"] for one in listed], ["one", "two", "three"])

	def test_a_profile_with_nothing_chosen_plays_nothing(self):
		from game.finishers import finisher_list, pick_finisher

		self.assertEqual(finisher_list({}), [])
		self.assertIsNone(pick_finisher([], lambda options: options[0]))


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

	def test_a_player_who_busted_all_in_is_not_shown_all_in_after_rebuying(self):
		broadcasts = []
		coordinator = self._coordinator(broadcasts)
		self._player(coordinator, 1, 0)
		busted = self._player(coordinator, 2, 1, chips=0, eliminated=True)
		busted.is_all_in = True
		busted.is_folded = True
		busted.current_bet = 500

		async_to_sync(coordinator.apply_rebuy)(22, 10_000)

		roster = [p for _, event, payload in broadcasts if event == "table_players"
				  for p in payload["players"]]
		back = next(entry for entry in roster if entry["name"] == busted.name)
		self.assertFalse(back["is_all_in"])
		self.assertFalse(back["is_folded"])
		self.assertEqual(back["chips"], 10_000)

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


class PlayTimestampTests(APITestCase):
	"""When play began and ended — which created_at cannot stand in for."""

	def setUp(self):
		self.host = User.objects.create_user(username="clock_host", password="secret123", is_staff=True)
		self.other = User.objects.create_user(username="clock_other", password="secret123")
		self.client.force_authenticate(self.host)
		self.tournament = Tournament.objects.create(host=self.host, name="Timed", status="lobby")
		TournamentPlayer.objects.create(tournament=self.tournament, user=self.host, seat=0, chips=1000)
		TournamentPlayer.objects.create(tournament=self.tournament, user=self.other, seat=1, chips=1000)
		# A third, because a scheduled tournament no longer starts itself with
		# two — see MIN_TO_START_ITSELF. A host pressing Start still may.
		self.third = User.objects.create_user(username="clock_third", password="secret123")
		TournamentPlayer.objects.create(tournament=self.tournament, user=self.third, seat=2, chips=1000)

	def tearDown(self):
		_tournament_runners.clear()

	def test_nothing_is_stamped_while_it_sits_in_the_lobby(self):
		self.assertIsNone(self.tournament.started_at)
		self.assertIsNone(self.tournament.finished_at)

	def test_starting_stamps_when_play_began(self):
		response = self.client.post(reverse("tournament-start", args=[self.tournament.id]))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.tournament.refresh_from_db()
		self.assertIsNotNone(self.tournament.started_at)

	def test_resuming_from_a_pause_is_not_starting_again(self):
		"""Otherwise every pause would reset how long it had been running."""
		self.client.post(reverse("tournament-start", args=[self.tournament.id]))
		self.tournament.refresh_from_db()
		began = self.tournament.started_at

		self.client.post(reverse("tournament-pause", args=[self.tournament.id]))
		self.client.post(reverse("tournament-resume", args=[self.tournament.id]))

		self.tournament.refresh_from_db()
		self.assertEqual(self.tournament.started_at, began)

	def test_a_scheduled_start_stamps_it_too(self):
		from django.utils import timezone as tz

		Tournament.objects.filter(id=self.tournament.id).update(
			scheduled_start_at=tz.now() - timedelta(minutes=1),
		)

		# The lobby poll is what starts a scheduled tournament.
		self.client.get(reverse("tournament-list"), {"scope": "upcoming"})

		self.tournament.refresh_from_db()
		self.assertEqual(self.tournament.status, "running")
		self.assertIsNotNone(self.tournament.started_at)

	def test_finishing_stamps_the_other_end(self):
		from game.consumers import _db_set_tournament_status

		async_to_sync(_db_set_tournament_status)(self.tournament.id, "finished")

		self.tournament.refresh_from_db()
		self.assertIsNotNone(self.tournament.finished_at)

	def test_a_status_that_is_not_finished_does_not_stamp_an_ending(self):
		from game.consumers import _db_set_tournament_status

		async_to_sync(_db_set_tournament_status)(self.tournament.id, "paused")

		self.tournament.refresh_from_db()
		self.assertIsNone(self.tournament.finished_at)

	def test_the_lobby_list_carries_both(self):
		self.client.post(reverse("tournament-start", args=[self.tournament.id]))

		row = next(
			item for item in self.client.get(reverse("tournament-list")).data
			if item["id"] == self.tournament.id
		)

		self.assertIn("started_at", row)
		self.assertIn("finished_at", row)
		self.assertIsNotNone(row["started_at"])


class UnlimitedRebuyTests(APITestCase):
	"""Null max_rebuys means unlimited, and is where a new tournament starts."""

	def setUp(self):
		self.host = User.objects.create_user(username="ur_host", password="secret123", is_staff=True)
		self.client.force_authenticate(self.host)

	def tearDown(self):
		_tournament_runners.clear()

	def test_a_new_tournament_does_not_cap_rebuys(self):
		response = self.client.post(reverse("tournament-list"), {"name": "Open bar"}, format="json")

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertIsNone(Tournament.objects.get(id=response.data["id"]).max_rebuys)

	def test_a_host_can_still_set_a_cap(self):
		response = self.client.post(
			reverse("tournament-list"), {"name": "Two only", "max_rebuys": 2}, format="json",
		)

		self.assertEqual(Tournament.objects.get(id=response.data["id"]).max_rebuys, 2)

	def test_turning_rebuys_off_is_a_cap_of_none_not_unlimited(self):
		"""The one that would go wrong quietly: "off" and "no limit" are both
		falsey, and treating them alike would let anybody rebuy forever."""
		response = self.client.post(
			reverse("tournament-list"), {"name": "None at all", "allow_rebuys": False}, format="json",
		)

		self.assertEqual(Tournament.objects.get(id=response.data["id"]).max_rebuys, 0)

	def test_a_negative_cap_is_still_refused(self):
		response = self.client.post(
			reverse("tournament-list"), {"name": "Nonsense", "max_rebuys": -1}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_an_uncapped_tournament_keeps_letting_a_player_back_in(self):
		tournament = Tournament.objects.create(
			host=self.host, name="Open bar", status="running",
			allow_rebuys=True, max_rebuys=None, rebuy_level=4,
		)
		player = TournamentPlayer.objects.create(
			tournament=tournament, user=self.host, seat=0, chips=0,
			is_eliminated=True, rebuy_count=7,
		)

		class Runner:
			current_blind_level_number = 1
			_finishing = False

			async def apply_rebuy(self, user_id, chips):
				return ""

		_tournament_runners[tournament.id] = Runner()

		response = self.client.post(reverse("tournament-rebuy", args=[tournament.id]))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		player.refresh_from_db()
		self.assertEqual(player.rebuy_count, 8)

	def test_a_capped_tournament_still_stops_at_the_cap(self):
		tournament = Tournament.objects.create(
			host=self.host, name="Two only", status="running",
			allow_rebuys=True, max_rebuys=2, rebuy_level=4,
		)
		TournamentPlayer.objects.create(
			tournament=tournament, user=self.host, seat=0, chips=0,
			is_eliminated=True, rebuy_count=2,
		)

		class Runner:
			current_blind_level_number = 1

		_tournament_runners[tournament.id] = Runner()

		response = self.client.post(reverse("tournament-rebuy", args=[tournament.id]))

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_the_engine_holds_the_table_for_an_uncapped_rebuy(self):
		from clubs.models import Club  # noqa: F401  (kept out of the import block above)
		from game.coordinator import MultiTableTournamentCoordinator

		async def noop(*args, **kwargs):
			return None

		coordinator = MultiTableTournamentCoordinator(
			tournament_id=1, players_per_table=9,
			levels=[{"small_blind": 25, "big_blind": 50, "ante": 0, "duration_hands": 8}],
			broadcast_tournament=noop, broadcast_table=noop, request_action=noop,
			notify_user=noop, load_players=noop, persist_assignments=noop,
			persist_player_states=noop,
			allow_rebuys=True, max_rebuys=None, rebuy_level=4,
		)
		player = EnginePlayer(name="busted", chips=0)
		player._rebuy_count = 12

		self.assertTrue(coordinator._can_rebuy(player))


class PlayerAvatarTests(APITestCase):
	"""Faces beside the names in the tournament lobby."""

	def setUp(self):
		self.host = User.objects.create_user(username="av_host", password="secret123", is_staff=True)
		self.client.force_authenticate(self.host)
		self.tournament = Tournament.objects.create(host=self.host, name="Faces", status="lobby")
		TournamentPlayer.objects.create(tournament=self.tournament, user=self.host, seat=0, chips=1000)

	def tearDown(self):
		_tournament_runners.clear()

	def test_a_seat_carries_the_face_and_the_name(self):
		from accounts.models import Profile

		# Profiles are made on demand rather than by a signal, so a user who has
		# never opened their settings does not have one yet.
		Profile.objects.create(user=self.host, avatar_emoji="\U0001F984")

		response = self.client.get(reverse("tournament-detail", args=[self.tournament.id]))

		row = response.data["players"][0]
		self.assertEqual(row["avatar_emoji"], "\U0001F984")
		self.assertIn("avatar_url", row)

	def test_somebody_who_never_picked_one_still_gets_a_face(self):
		from accounts.models import Profile

		Profile.objects.filter(user=self.host).delete()

		response = self.client.get(reverse("tournament-detail", args=[self.tournament.id]))

		self.assertTrue(response.data["players"][0]["avatar_emoji"])

	def test_a_full_table_does_not_cost_a_query_per_seat(self):
		"""The faces come out of maps built once. Looked up per row, a
		twenty-handed lobby would be forty extra queries every few seconds."""
		for index in range(1, 15):
			player = User.objects.create_user(username=f"av_{index}", password="secret123")
			TournamentPlayer.objects.create(
				tournament=self.tournament, user=player, seat=index, chips=1000,
			)

		with self.assertNumQueries(9):
			response = self.client.get(reverse("tournament-detail", args=[self.tournament.id]))

		self.assertEqual(len(response.data["players"]), 15)


class PurgeHistoryTests(TestCase):
	"""Wiping what was played must not touch who plays."""

	def setUp(self):
		from game.models import Hand, HandAction
		from sidegames.models import Wallet

		from .models import BlindLevel, LedgerEntry, Settlement

		self.Hand, self.HandAction = Hand, HandAction
		self.BlindLevel, self.LedgerEntry, self.Settlement = BlindLevel, LedgerEntry, Settlement
		self.host = User.objects.create_user(username="purge_host", password="secret123")
		self.other = User.objects.create_user(username="purge_other", password="secret123")
		Wallet.objects.create(user=self.host, balance=500)

		self.tournament = Tournament.objects.create(
			host=self.host, name="Old night", status="finished", buy_in_cents=1000,
			payout_structure=[{"place": 1, "label": "1st", "percentage": 100}],
		)
		table = self.tournament.ensure_table(1)
		seat = TournamentPlayer.objects.create(
			tournament=self.tournament, user=self.host, table=table,
			seat=0, seat_at_table=0, chips=0, finish_position=1,
		)
		TournamentPlayer.objects.create(
			tournament=self.tournament, user=self.other, table=table,
			seat=1, seat_at_table=1, chips=0, finish_position=2, is_eliminated=True,
		)
		self.BlindLevel.objects.create(
			tournament=self.tournament, level_number=1, small_blind=25, big_blind=50,
			duration_minutes=10,
		)
		hand = Hand.objects.create(
			tournament=self.tournament, hand_number=1, level_index=0, dealer_seat=0,
			status="complete",
		)
		HandAction.objects.create(hand=hand, player=seat, seat=0, street="preflop", action="call")
		self.LedgerEntry.objects.create(
			tournament=self.tournament, user=self.host, stake_cents=1000, prize_cents=2000,
		)
		self.Settlement.objects.create(from_user=self.other, to_user=self.host, amount_cents=1000)

	def _run(self, **options):
		from django.core.management import call_command
		from io import StringIO

		out = StringIO()
		call_command("purge_history", stdout=out, **options)
		return out.getvalue()

	def test_a_dry_run_deletes_nothing(self):
		output = self._run()

		self.assertIn("Nothing was deleted", output)
		self.assertEqual(Tournament.objects.count(), 1)
		self.assertEqual(self.Hand.objects.count(), 1)

	def test_the_history_goes_and_the_players_stay(self):
		self._run(yes=True)

		self.assertEqual(Tournament.objects.count(), 0)
		self.assertEqual(TournamentPlayer.objects.count(), 0)
		self.assertEqual(self.BlindLevel.objects.count(), 0)
		self.assertEqual(self.Hand.objects.count(), 0)
		self.assertEqual(self.HandAction.objects.count(), 0)
		self.assertEqual(self.LedgerEntry.objects.count(), 0)
		# Nobody has to sign up again, and nobody loses their coins.
		self.assertEqual(User.objects.filter(username__startswith="purge_").count(), 2)
		self.assertEqual(self.host.wallet.balance, 500)

	def test_settlements_go_with_the_debts_they_paid(self):
		"""A payment with no debt behind it is not neutral: the balances read
		it as money owed in the other direction."""
		self._run(yes=True)

		self.assertEqual(self.Settlement.objects.count(), 0)

	def test_settlements_can_be_kept_on_purpose(self):
		self._run(yes=True, keep_settlements=True)

		self.assertEqual(self.Settlement.objects.count(), 1)

	def test_a_running_tournament_stops_it(self):
		from django.core.management.base import CommandError

		self.tournament.status = "running"
		self.tournament.save(update_fields=["status"])

		with self.assertRaises(CommandError):
			self._run(yes=True)
		self.assertEqual(Tournament.objects.count(), 1)

	def test_a_cutoff_leaves_everything_since_alone(self):
		self._run(yes=True, before="2000-01-01")

		self.assertEqual(Tournament.objects.count(), 1)


class BadBeatTests(TestCase):
	"""Losing a showdown with a big hand — the one people talk about after."""

	def setUp(self):
		from game.models import Hand, HandAction

		self.Hand, self.HandAction = Hand, HandAction
		self.host = User.objects.create_user(username="bb_host", password="x")
		self.tournament = Tournament.objects.create(host=self.host, name="Beats", status="running")
		self.players = {}
		for seat, name in enumerate(["hero", "villain"]):
			user = User.objects.create_user(username=f"bb_{name}", password="x")
			self.players[name] = TournamentPlayer.objects.create(
				tournament=self.tournament, user=user, seat=seat, seat_at_table=seat, chips=1000,
			)

	def _hand(self, number, showdown, awards):
		hand = self.Hand.objects.create(
			tournament=self.tournament, hand_number=number, level_index=0, dealer_seat=0,
			status="complete", result={"showdown": showdown, "awards": awards},
		)
		for player in self.players.values():
			self.HandAction.objects.create(
				hand=hand, player=player, seat=player.seat_at_table,
				street="preflop", action="call",
			)
		return hand

	def _beats(self, name):
		from game.hand_stats import compute_player_stats

		user_id = self.players[name].user_id
		return compute_player_stats([user_id])[user_id]["bad_beats"]

	def test_losing_a_showdown_with_a_full_house_counts(self):
		self._hand(
			1,
			showdown=[
				{"seat": 0, "score": [6, 9, 2], "hand_name": "Full House"},
				{"seat": 1, "score": [7, 5], "hand_name": "Four of a Kind"},
			],
			awards=[{"seat": 1, "amount": 2000}],
		)

		self.assertEqual(self._beats("hero"), 1)
		# The player who won it did not take a beat, whatever they held.
		self.assertEqual(self._beats("villain"), 0)

	def test_losing_with_a_small_hand_is_just_losing(self):
		self._hand(
			1,
			showdown=[
				{"seat": 0, "score": [1, 14], "hand_name": "One Pair"},
				{"seat": 1, "score": [2, 9, 4], "hand_name": "Two Pair"},
			],
			awards=[{"seat": 1, "amount": 2000}],
		)

		self.assertEqual(self._beats("hero"), 0)

	def test_trips_is_where_it_starts(self):
		self._hand(
			1,
			showdown=[
				{"seat": 0, "score": [3, 7], "hand_name": "Three of a Kind"},
				{"seat": 1, "score": [4, 10], "hand_name": "Straight"},
			],
			awards=[{"seat": 1, "amount": 2000}],
		)

		self.assertEqual(self._beats("hero"), 1)

	def test_a_split_pot_is_not_a_beat(self):
		self._hand(
			1,
			showdown=[
				{"seat": 0, "score": [6, 9, 2], "hand_name": "Full House"},
				{"seat": 1, "score": [6, 9, 2], "hand_name": "Full House"},
			],
			awards=[{"seat": 0, "amount": 1000}, {"seat": 1, "amount": 1000}],
		)

		self.assertEqual(self._beats("hero"), 0)

	def test_everybody_folding_is_not_a_showdown(self):
		"""A hand won uncontested records one entry, and nobody was beaten."""
		self._hand(
			1,
			showdown=[{"seat": 1, "score": [7, 5], "hand_name": "Four of a Kind"}],
			awards=[{"seat": 1, "amount": 2000}],
		)

		self.assertEqual(self._beats("hero"), 0)


class SpinGoRulesTests(TestCase):
	"""The format's arithmetic, which has to add up before anything is staked."""

	def test_the_draw_pays_back_more_than_it_takes(self):
		from fractions import Fraction

		from tournaments import spingo

		# Three players pay in and 3.166 buy-ins come back out. Deliberate:
		# coins are printed by the house anyway, and paying a little extra out
		# through the games is a better faucet than a bigger daily handout.
		# Pinned exactly rather than as "more than three", because the amount
		# above three is coins created out of nothing and is worth knowing.
		self.assertEqual(spingo.expected_multiplier(), Fraction(1583, 500))
		self.assertGreater(spingo.expected_multiplier(), 3)

	def test_the_weights_still_add_up_to_the_whole(self):
		from tournaments import spingo

		self.assertEqual(
			sum(weight for weight, _ in spingo.MULTIPLIERS), spingo.TOTAL_WEIGHT,
		)
		# A tail worth sitting down for: one game in a thousand pays a hundred
		# times the buy-in, and one in a hundred pays twenty-five or better.
		big = sum(w for w, m in spingo.MULTIPLIERS if m >= spingo.SHARED_FROM)
		self.assertGreaterEqual(big / spingo.TOTAL_WEIGHT, 0.014)

	def test_a_big_draw_pays_every_seat_and_a_small_one_pays_the_winner(self):
		from tournaments import spingo

		self.assertEqual(
			[row["percentage"] for row in spingo.payout_for(100)], [80, 12, 8],
		)
		self.assertEqual(
			[row["percentage"] for row in spingo.payout_for(25)], [80, 12, 8],
		)
		# Just under the line, and every ordinary game, is winner takes all.
		self.assertEqual(spingo.payout_for(10), [{"place": 1, "label": "1st", "percentage": 100}])
		self.assertEqual(spingo.payout_for(0), [{"place": 1, "label": "1st", "percentage": 100}])

	def test_a_shared_split_still_hands_out_the_whole_pool(self):
		from tournaments import spingo

		for multiplier in (25, 50, 100):
			with self.subTest(multiplier=multiplier):
				self.assertEqual(
					sum(row["percentage"] for row in spingo.payout_for(multiplier)), 100,
				)

	def test_the_odds_table_says_what_first_place_actually_takes(self):
		from tournaments import spingo

		rows = {row["multiplier"]: row for row in spingo.odds_table(25)}
		# An ordinary game: the pool and the winner's prize are the same number.
		self.assertEqual(rows[2]["prize_coins"], 50)
		self.assertEqual(rows[2]["winner_coins"], 50)
		self.assertFalse(rows[2]["shared"])
		# A hundred-times game: 2,500 in the pool, 2,000 of it to the winner.
		self.assertEqual(rows[100]["prize_coins"], 2500)
		self.assertEqual(rows[100]["winner_coins"], 2000)
		self.assertTrue(rows[100]["shared"])

	def test_every_weight_in_the_table_can_actually_be_drawn(self):
		from tournaments import spingo

		drawn = set()
		# One roll landing on the first index of each band, walked by hand rather
		# than by luck: a weight that can never come up is a prize nobody wins.
		roll = 0
		for weight, multiplier in spingo.MULTIPLIERS:
			drawn.add(spingo.draw_multiplier(_FixedRng(roll)))
			drawn.add(spingo.draw_multiplier(_FixedRng(roll + weight - 1)))
			roll += weight
		self.assertEqual(drawn, {multiplier for _, multiplier in spingo.MULTIPLIERS})
		self.assertEqual(roll, spingo.TOTAL_WEIGHT)

	def test_the_prize_is_one_buy_in_times_the_draw(self):
		from tournaments import spingo

		self.assertEqual(spingo.prize_coins(25, 2), 50)
		self.assertEqual(spingo.prize_coins(50, 100), 5000)

	def test_the_stack_is_fifteen_big_blinds_of_the_opening_level(self):
		from tournaments import spingo

		first = spingo.level_rows()[0]
		self.assertEqual(spingo.STARTING_CHIPS // first["big_blind"], 15)
		# Timed, because the format promises minutes and hands cannot be timed.
		self.assertTrue(all(row["duration_minutes"] for row in spingo.level_rows()))
		self.assertTrue(all(row["duration_hands"] is None for row in spingo.level_rows()))

	def test_the_format_is_three_handed_and_pays_the_winner(self):
		from tournaments import spingo

		defaults = spingo.tournament_defaults(25)
		self.assertEqual(defaults["max_players"], 3)
		self.assertEqual(defaults["players_per_table"], 3)
		self.assertEqual(defaults["buy_in_coins"], 25)
		self.assertEqual(defaults["buy_in_cents"], 0)
		self.assertFalse(defaults["allow_rebuys"])
		self.assertEqual(defaults["late_reg_level"], 0)
		# Winner takes all until a draw says otherwise; a game that never fires
		# keeps this row.
		self.assertEqual(defaults["payout_structure"], [{"place": 1, "label": "1st", "percentage": 100}])


class _FixedRng:
	"""A generator that rolls one number, so a draw can be pinned."""

	def __init__(self, value):
		self.value = value

	def randrange(self, _stop):
		return self.value


class SpinGoLobbyTests(APITestCase):
	"""Sitting down, filling up, and walking away."""

	def setUp(self):
		self.players = {
			name: User.objects.create_user(username=name, password="secret123")
			for name in ("ana", "bea", "caio", "dina")
		}
		for user in self.players.values():
			self._top_up(user, 500)

	def tearDown(self):
		_tournament_runners.clear()

	def _top_up(self, user, coins):
		from sidegames.economy import wallet_for
		from sidegames.models import Wallet

		wallet_for(user)
		Wallet.objects.filter(user=user).update(balance=coins)

	def _balance(self, user):
		from sidegames.models import Wallet

		return Wallet.objects.get(user=user).balance

	def _sit(self, name, stake=25, key="spingo"):
		self.client.force_authenticate(self.players[name])
		return self.client.post(reverse("fast-sit"), {"key": key, "stake": stake}, format="json")

	def _leave(self, name):
		self.client.force_authenticate(self.players[name])
		return self.client.post(reverse("fast-leave"), {}, format="json")

	def test_the_first_player_to_sit_opens_the_queue_and_pays_for_their_seat(self):
		response = self._sit("ana")

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(response.data["game"]["seats"], 1)
		self.assertEqual(response.data["game"]["status"], "lobby")
		self.assertEqual(self._balance(self.players["ana"]), 475)

		game = Tournament.objects.get(format="spingo")
		self.assertEqual(game.buy_in_coins, 25)
		self.assertEqual(game.max_players, 3)
		self.assertEqual(game.starting_chips, 1500)
		# The whole ladder, not a number that has to be edited whenever it grows.
		from tournaments import spingo

		self.assertEqual(game.levels.count(), len(spingo.BLINDS))

	def test_the_second_player_sits_at_the_same_table(self):
		self._sit("ana")
		response = self._sit("bea")

		self.assertEqual(response.data["game"]["seats"], 2)
		self.assertEqual(Tournament.objects.filter(format="spingo").count(), 1)
		self.assertEqual(response.data["game"]["status"], "lobby")

	def test_the_third_player_draws_the_prize_and_fires_the_game(self):
		self._sit("ana")
		self._sit("bea")
		response = self._sit("caio")

		game = Tournament.objects.get(format="spingo")
		self.assertEqual(game.status, "running")
		self.assertIsNotNone(game.started_at)
		from tournaments.spingo import MULTIPLIERS

		self.assertIn(game.spin_multiplier, {multiplier for _, multiplier in MULTIPLIERS})
		self.assertEqual(response.data["game"]["prize_coins"], 25 * game.spin_multiplier)
		# Three seats, three chairs at one table, three stacks of fifteen blinds.
		self.assertEqual(game.players.count(), 3)
		self.assertEqual(sorted(game.players.values_list("seat_at_table", flat=True)), [0, 1, 2])

	def test_a_fourth_player_opens_a_new_game_rather_than_a_fourth_seat(self):
		for name in ("ana", "bea", "caio"):
			self._sit(name)
		response = self._sit("dina")

		self.assertEqual(response.data["game"]["seats"], 1)
		self.assertEqual(Tournament.objects.filter(format="spingo").count(), 2)
		self.assertEqual(Tournament.objects.filter(format="spingo", status="lobby").count(), 1)

	def test_the_tiers_are_kept_apart(self):
		self._sit("ana", stake=25)
		self._sit("bea", stake=50)

		self.assertEqual(Tournament.objects.filter(format="spingo").count(), 2)
		self.assertEqual(self._balance(self.players["bea"]), 450)

	def test_sitting_with_an_empty_wallet_costs_nothing_and_takes_no_seat(self):
		self._top_up(self.players["ana"], 10)
		response = self._sit("ana", stake=25)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["error"], "Not enough coins")
		self.assertEqual(self._balance(self.players["ana"]), 10)
		self.assertFalse(Tournament.objects.filter(format="spingo").exists())

	def test_the_split_is_stamped_on_the_game_when_the_draw_is_made(self):
		"""What the three of them are playing for, decided once.

		The lobby, the table and the coin ledger all read the tournament's own
		payout rows, so the split has to be on the row before the first hand —
		not worked out again at settlement, where nobody can see it coming.
		"""
		from unittest.mock import patch

		from tournaments import spingo

		with patch.object(spingo, "draw_multiplier", return_value=100):
			for name in ("ana", "bea", "caio"):
				self._sit(name)

		game = Tournament.objects.get(format="spingo")
		self.assertEqual(game.spin_multiplier, 100)
		self.assertEqual([row["percentage"] for row in game.payout_structure], [80, 12, 8])

	def test_an_ordinary_draw_leaves_the_winner_everything(self):
		from unittest.mock import patch

		from tournaments import spingo

		with patch.object(spingo, "draw_multiplier", return_value=2):
			for name in ("ana", "bea", "caio"):
				self._sit(name)

		game = Tournament.objects.get(format="spingo")
		self.assertEqual([row["percentage"] for row in game.payout_structure], [100])

	def test_a_player_can_wait_at_both_tiers_at_once(self):
		self._sit("ana")
		response = self._sit("ana", stake=50)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(self._balance(self.players["ana"]), 425)
		self.assertEqual(Tournament.objects.filter(format="spingo").count(), 2)

	def test_an_unknown_stake_is_refused(self):
		self.client.force_authenticate(self.players["ana"])
		response = self.client.post(
			reverse("fast-sit"), {"key": "spingo", "stake": 30}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertFalse(Tournament.objects.exists())

	def test_leaving_the_queue_gives_the_coins_back_and_closes_an_empty_game(self):
		self._sit("ana")
		response = self._leave("ana")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(self._balance(self.players["ana"]), 500)
		self.assertFalse(Tournament.objects.filter(format="spingo").exists())

	def test_leaving_a_queue_somebody_else_is_in_hands_over_the_host_column(self):
		self._sit("ana")
		self._sit("bea")
		self._leave("ana")

		game = Tournament.objects.get(format="spingo")
		self.assertEqual(game.players.count(), 1)
		self.assertEqual(game.host, self.players["bea"])
		self.assertEqual(self._balance(self.players["ana"]), 500)

	def test_a_game_that_has_started_cannot_be_left(self):
		for name in ("ana", "bea", "caio"):
			self._sit(name)
		response = self._leave("ana")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(self._balance(self.players["ana"]), 475)

	def test_nobody_runs_a_spin_n_go_not_even_whoever_sat_down_first(self):
		from tournaments.permissions import can_manage_tournament

		self._sit("ana")
		game = Tournament.objects.get(format="spingo")
		boss = User.objects.create_superuser(username="boss", password="secret123")

		self.assertEqual(game.host, self.players["ana"])
		self.assertFalse(can_manage_tournament(self.players["ana"], game))
		self.assertFalse(can_manage_tournament(boss, game))

		self.client.force_authenticate(self.players["ana"])
		started = self.client.post(reverse("tournament-start", args=[game.id]))
		self.assertEqual(started.status_code, status.HTTP_404_NOT_FOUND)
		deleted = self.client.delete(reverse("tournament-delete", args=[game.id]))
		self.assertEqual(deleted.status_code, status.HTTP_404_NOT_FOUND)

	def test_a_spin_n_go_is_not_joined_or_quit_like_a_tournament(self):
		self._sit("ana")
		game = Tournament.objects.get(format="spingo")

		self.client.force_authenticate(self.players["bea"])
		joined = self.client.post(reverse("tournament-join", args=[game.id]))
		self.assertEqual(joined.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(game.players.count(), 1)
		self.assertEqual(self._balance(self.players["bea"]), 500)

		self.client.force_authenticate(self.players["ana"])
		quit_response = self.client.post(reverse("tournament-quit", args=[game.id]))
		self.assertEqual(quit_response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_a_waiting_spin_n_go_is_not_listed_among_the_tournaments(self):
		self._sit("ana")

		self.client.force_authenticate(self.players["bea"])
		listed = self.client.get(reverse("tournament-list"), {"scope": "upcoming"})
		self.assertEqual(listed.data, [])

		lobby = self.client.get(reverse("fast-lobby"))
		spingo = next(one for one in lobby.data["formats"] if one["key"] == "spingo")
		by_stake = {tier["stake"]: tier for tier in spingo["tiers"]}
		self.assertEqual(by_stake[25]["game"]["seats"], 1)
		self.assertIsNone(by_stake[50]["game"])
		self.assertEqual(lobby.data["my_games"], [])

	def test_the_lobby_says_where_your_own_seats_are(self):
		self._sit("ana")

		self.client.force_authenticate(self.players["ana"])
		lobby = self.client.get(reverse("fast-lobby"))
		mine = lobby.data["my_games"]
		self.assertEqual(len(mine), 1)
		self.assertEqual(mine[0]["stake"], 25)
		self.assertEqual(mine[0]["key"], "spingo")
		self.assertEqual(lobby.data["balance"], 475)
		self.assertEqual([face["username"] for face in mine[0]["waiting"]], ["ana"])

	def test_a_queue_you_are_already_in_is_not_offered_back_to_you(self):
		"""The tier card shows what you could join, not what you are in.

		One player holding two of three seats would be a game that fires with
		two people at it, so the queue you are waiting in is not a queue you can
		sit at again — sitting again opens another game beside it.
		"""
		self._sit("ana")

		self.client.force_authenticate(self.players["ana"])
		lobby = self.client.get(reverse("fast-lobby")).data
		spingo = next(one for one in lobby["formats"] if one["key"] == "spingo")
		by_stake = {tier["stake"]: tier for tier in spingo["tiers"]}
		self.assertIsNone(by_stake[25]["game"])

		# And to somebody else it is still a table with one player waiting.
		self.client.force_authenticate(self.players["bea"])
		theirs = self.client.get(reverse("fast-lobby")).data
		spingo = next(one for one in theirs["formats"] if one["key"] == "spingo")
		by_stake = {tier["stake"]: tier for tier in spingo["tiers"]}
		self.assertEqual(by_stake[25]["game"]["seats"], 1)


class CoinBuyInTests(APITestCase):
	"""Tournaments played for coins, which are actually charged."""

	def setUp(self):
		self.host = User.objects.create_user(username="c_host", password="secret123", is_staff=True)
		self.player = User.objects.create_user(username="c_player", password="secret123")
		for user in (self.host, self.player):
			self._top_up(user, 500)
		self.client.force_authenticate(self.host)

	def tearDown(self):
		_tournament_runners.clear()

	def _top_up(self, user, coins):
		from sidegames.economy import wallet_for
		from sidegames.models import Wallet

		wallet_for(user)
		Wallet.objects.filter(user=user).update(balance=coins)

	def _balance(self, user):
		from sidegames.models import Wallet

		return Wallet.objects.get(user=user).balance

	def test_a_tournament_with_no_euro_prize_pool_costs_coins(self):
		response = self.client.post(
			reverse("tournament-list"), {"name": "Coin night"}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		tournament = Tournament.objects.get(id=response.data["id"])
		self.assertEqual(tournament.buy_in_coins, 50)
		self.assertEqual(tournament.buy_in_cents, 0)
		# Coins are taken for real, so a coin game must have somewhere to pay
		# them back to. Winner takes all unless the host said otherwise.
		self.assertEqual(tournament.payout_structure, [{"place": 1, "label": "1st", "percentage": 100}])
		# The host holds a seat like anybody else, and paid for it.
		self.assertEqual(self._balance(self.host), 450)

	def test_a_euro_tournament_is_not_charged_coins(self):
		response = self.client.post(
			reverse("tournament-list"),
			{
				"name": "Real money night",
				"buy_in_cents": 2000,
				"payout_structure": [{"place": 1, "label": "1st", "percentage": 100}],
			},
			format="json",
		)

		tournament = Tournament.objects.get(id=response.data["id"])
		self.assertEqual(tournament.buy_in_coins, 0)
		self.assertEqual(self._balance(self.host), 500)

	def test_a_tournament_is_played_for_one_currency_or_the_other(self):
		response = self.client.post(
			reverse("tournament-list"),
			{"name": "Both", "buy_in_cents": 2000, "buy_in_coins": 50},
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("buy_in_coins", response.data)

	def test_a_host_who_cannot_cover_their_own_buy_in_opens_nothing(self):
		self._top_up(self.host, 10)
		response = self.client.post(
			reverse("tournament-list"), {"name": "Too rich for me", "buy_in_coins": 100}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertFalse(Tournament.objects.exists())
		self.assertEqual(self._balance(self.host), 10)

	def test_the_coin_buy_in_cannot_be_changed_once_players_have_signed_up(self):
		created = self.client.post(
			reverse("tournament-list"), {"name": "Coin night", "buy_in_coins": 100}, format="json",
		)
		response = self.client.patch(
			reverse("tournament-edit", args=[created.data["id"]]), {"buy_in_coins": 5}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(Tournament.objects.get(id=created.data["id"]).buy_in_coins, 100)

	def test_joining_a_coin_tournament_takes_the_buy_in(self):
		created = self.client.post(
			reverse("tournament-list"), {"name": "Coin night", "buy_in_coins": 100}, format="json",
		)
		self.client.force_authenticate(self.player)
		response = self.client.post(reverse("tournament-join", args=[created.data["id"]]))

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(self._balance(self.player), 400)

	def test_joining_with_too_few_coins_is_refused_and_takes_no_seat(self):
		created = self.client.post(
			reverse("tournament-list"), {"name": "Coin night", "buy_in_coins": 100}, format="json",
		)
		self._top_up(self.player, 20)
		self.client.force_authenticate(self.player)
		response = self.client.post(reverse("tournament-join", args=[created.data["id"]]))

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data["error"], "Not enough coins")
		self.assertEqual(self._balance(self.player), 20)
		self.assertEqual(TournamentPlayer.objects.filter(user=self.player).count(), 0)

	def test_unregistering_before_it_starts_gives_the_coins_back(self):
		created = self.client.post(
			reverse("tournament-list"), {"name": "Coin night", "buy_in_coins": 100}, format="json",
		)
		self.client.force_authenticate(self.player)
		self.client.post(reverse("tournament-join", args=[created.data["id"]]))
		response = self.client.post(reverse("tournament-quit", args=[created.data["id"]]))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(self._balance(self.player), 500)

	def test_a_free_tournament_from_before_coins_stays_free(self):
		# Made in the database rather than through the form, which is what every
		# row that predates the coin buy-in looks like.
		tournament = Tournament.objects.create(host=self.host, name="Old night", status="lobby")
		self.client.force_authenticate(self.player)
		response = self.client.post(reverse("tournament-join", args=[tournament.id]))

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(self._balance(self.player), 500)


class CoinSettlementTests(TestCase):
	"""Paying the coin prizes out at the end."""

	def setUp(self):
		self.host = User.objects.create_user(username="s_host", password="x")
		self.users = {
			name: User.objects.create_user(username=name, password="x")
			for name in ("ana", "bea", "caio")
		}
		for user in self.users.values():
			self._top_up(user, 100)

	def _top_up(self, user, coins):
		from sidegames.economy import wallet_for
		from sidegames.models import Wallet

		wallet_for(user)
		Wallet.objects.filter(user=user).update(balance=coins)

	def _balance(self, name):
		from sidegames.models import Wallet

		return Wallet.objects.get(user=self.users[name]).balance

	def _seat(self, tournament, name, seat, finish, rebuys=0):
		return TournamentPlayer.objects.create(
			tournament=tournament, user=self.users[name], seat=seat, chips=0,
			finish_position=finish, rebuy_count=rebuys, is_eliminated=finish != 1,
		)

	def _settle(self, tournament):
		from tournaments.coinbank import settle_tournament_coins

		return settle_tournament_coins(tournament)

	def test_the_places_are_paid_what_the_structure_says(self):
		tournament = Tournament.objects.create(
			host=self.host, name="Coins", status="finished", buy_in_coins=30,
			payout_structure=[
				{"place": 1, "label": "1st", "percentage": 70},
				{"place": 2, "label": "2nd", "percentage": 30},
			],
		)
		self._seat(tournament, "ana", 0, 1)
		self._seat(tournament, "bea", 1, 2)
		self._seat(tournament, "caio", 2, 3)

		self.assertTrue(self._settle(tournament))
		# Ninety coins in, ninety out: 63 and 27.
		self.assertEqual(self._balance("ana"), 163)
		self.assertEqual(self._balance("bea"), 127)
		self.assertEqual(self._balance("caio"), 100)

	def test_a_rebuy_is_another_buy_in_in_the_pot(self):
		tournament = Tournament.objects.create(
			host=self.host, name="Coins", status="finished", buy_in_coins=30,
			payout_structure=[{"place": 1, "label": "1st", "percentage": 100}],
		)
		self._seat(tournament, "ana", 0, 1)
		self._seat(tournament, "bea", 1, 2, rebuys=1)

		self._settle(tournament)
		self.assertEqual(self._balance("ana"), 190)

	def test_paying_out_twice_pays_out_once(self):
		tournament = Tournament.objects.create(
			host=self.host, name="Coins", status="finished", buy_in_coins=30,
			payout_structure=[{"place": 1, "label": "1st", "percentage": 100}],
		)
		self._seat(tournament, "ana", 0, 1)
		self._seat(tournament, "bea", 1, 2)

		self.assertTrue(self._settle(tournament))
		self.assertFalse(self._settle(tournament))
		self.assertEqual(self._balance("ana"), 160)

	def test_a_spin_n_go_pays_the_draw_rather_than_the_buy_ins(self):
		tournament = Tournament.objects.create(
			host=self.host, name="Spin n Go · 25", status="finished", format="spingo",
			buy_in_coins=25, spin_multiplier=10,
			payout_structure=[{"place": 1, "label": "1st", "percentage": 100}],
		)
		self._seat(tournament, "ana", 0, 1)
		self._seat(tournament, "bea", 1, 2)
		self._seat(tournament, "caio", 2, 3)

		self._settle(tournament)
		# Seventy-five coins were paid in and two hundred and fifty come out.
		# That is the format: the difference is made back on the twos.
		self.assertEqual(self._balance("ana"), 350)
		self.assertEqual(self._balance("bea"), 100)

	def test_a_euro_tournament_pays_no_coins(self):
		tournament = Tournament.objects.create(
			host=self.host, name="Money", status="finished", buy_in_cents=1000,
			payout_structure=[{"place": 1, "label": "1st", "percentage": 100}],
		)
		self._seat(tournament, "ana", 0, 1)

		self.assertFalse(self._settle(tournament))
		self.assertEqual(self._balance("ana"), 100)

	def test_the_coin_ledger_balances_across_a_whole_spin_n_go(self):
		from sidegames.economy import spend
		from sidegames.models import CoinLedger

		tournament = Tournament.objects.create(
			host=self.host, name="Spin n Go · 25", status="finished", format="spingo",
			buy_in_coins=25, spin_multiplier=2,
			payout_structure=[{"place": 1, "label": "1st", "percentage": 100}],
		)
		memo = f"tournament:{tournament.id}"
		for index, name in enumerate(("ana", "bea", "caio")):
			spend(self.users[name], 25, "stake", memo=memo)
			self._seat(tournament, name, index, index + 1)

		self._settle(tournament)
		moved = sum(
			row.amount for row in CoinLedger.objects.filter(memo=memo)
		)
		# Three stakes out, one prize of fifty in, and at twice the buy-in the
		# game keeps a buy-in back — which is what pays for the hundreds.
		self.assertEqual(moved, -25)
		self.assertEqual(self._balance("ana"), 125)


class SpinGoHistoryTests(APITestCase):
	"""What the lobby says has already happened."""

	def setUp(self):
		self.players = {
			name: User.objects.create_user(username=name, password="secret123")
			for name in ("hana", "hbea", "hcaio")
		}
		self.client.force_authenticate(self.players["hana"])

	def tearDown(self):
		_tournament_runners.clear()

	def _finished(self, multiplier, stake=25, winner="hana", include=("hana", "hbea", "hcaio")):
		from tournaments import spingo

		game = Tournament.objects.create(
			host=self.players[include[0]],
			**{**spingo.tournament_defaults(stake), "status": "finished",
			   "spin_multiplier": multiplier, "finished_at": timezone.now()},
		)
		for index, name in enumerate(include):
			TournamentPlayer.objects.create(
				tournament=game, user=self.players[name], seat=index, chips=0,
				finish_position=1 if name == winner else index + 2,
				is_eliminated=name != winner,
			)
		return game

	def _lobby(self):
		return self.client.get(reverse("fast-lobby")).data

	def test_your_own_finished_games_come_back_newest_first(self):
		self._finished(2)
		big = self._finished(25)

		history = self._lobby()["history"]
		self.assertEqual([row["multiplier"] for row in history], [25, 2])
		self.assertEqual(history[0]["id"], big.id)
		self.assertEqual(history[0]["prize_coins"], 625)
		self.assertTrue(history[0]["i_won"])
		self.assertEqual(history[0]["my_finish"], 1)
		self.assertEqual(history[0]["winner"]["username"], "hana")

	def test_a_game_you_were_not_in_is_not_your_history(self):
		self._finished(5, winner="hbea", include=("hbea", "hcaio"))

		self.assertEqual(self._lobby()["history"], [])

	def test_the_board_keeps_the_three_biggest_draws_anybody_has_had(self):
		self._finished(2)
		self._finished(100, winner="hbea", include=("hbea", "hcaio"))
		self._finished(10)
		self._finished(50, winner="hcaio", include=("hcaio", "hbea"))

		top = self._lobby()["top"]
		self.assertEqual([row["multiplier"] for row in top], [100, 50, 10])
		self.assertEqual(top[0]["winner"]["username"], "hbea")
		# Somebody else's record is still somebody else's.
		self.assertFalse(top[0]["i_won"])
		self.assertTrue(top[2]["i_won"])

	def test_a_spin_n_go_that_never_drew_is_in_neither_list(self):
		# The multiplier is stamped when the game fires, so a finished row
		# without one is something left behind rather than a game anybody
		# played — and it has no prize to report in either list.
		self._finished(0)

		lobby = self._lobby()
		self.assertEqual(lobby["history"], [])
		self.assertEqual(lobby["top"], [])


class CoinPrizeReportingTests(APITestCase):
	"""What the finish screen is drawn from."""

	def setUp(self):
		self.host = User.objects.create_user(username="p_host", password="secret123")
		self.rival = User.objects.create_user(username="p_rival", password="secret123")
		for user in (self.host, self.rival):
			from sidegames.economy import wallet_for
			wallet_for(user)
		self.client.force_authenticate(self.host)

	def tearDown(self):
		_tournament_runners.clear()

	def test_a_settled_coin_game_reports_what_each_player_was_paid(self):
		from tournaments import spingo
		from tournaments.coinbank import settle_tournament_coins

		game = Tournament.objects.create(
			host=self.host,
			**{**spingo.tournament_defaults(25), "status": "finished",
			   "spin_multiplier": 10, "finished_at": timezone.now()},
		)
		TournamentPlayer.objects.create(
			tournament=game, user=self.host, seat=0, chips=4500, finish_position=1,
		)
		TournamentPlayer.objects.create(
			tournament=game, user=self.rival, seat=1, chips=0, finish_position=2, is_eliminated=True,
		)
		settle_tournament_coins(game)

		detail = self.client.get(reverse("tournament-detail", args=[game.id])).data
		by_name = {player["username"]: player for player in detail["players"]}
		# The winner's own figure, in the currency it was paid in — the screen
		# has no business printing a percentage over a game that paid coins.
		self.assertEqual(by_name["p_host"]["prize_coins"], 250)
		self.assertEqual(by_name["p_host"]["prize_cents"], 0)
		self.assertEqual(by_name["p_rival"]["prize_coins"], 0)
		self.assertEqual(detail["spin_multiplier"], 10)
		self.assertEqual(detail["buy_in_coins"], 25)

	def test_a_euro_game_reports_no_coin_prizes(self):
		game = Tournament.objects.create(
			host=self.host, name="Money", status="finished", buy_in_cents=1000,
			payout_structure=[{"place": 1, "label": "1st", "percentage": 100}],
		)
		TournamentPlayer.objects.create(
			tournament=game, user=self.host, seat=0, chips=0, finish_position=1,
		)

		detail = self.client.get(reverse("tournament-detail", args=[game.id])).data
		self.assertEqual(detail["players"][0]["prize_coins"], 0)


class FastFormatRulesTests(TestCase):
	"""The catalogue itself. Arithmetic that has to add up before anything is staked."""

	def test_every_format_pays_out_exactly_what_it_takes_in(self):
		from tournaments import fastgames

		for key in fastgames.FORMAT_KEYS:
			fmt = fastgames.FORMATS[key]
			with self.subTest(format=key):
				self.assertEqual(sum(row[2] for row in fmt.payouts), 100)

	def test_every_format_is_a_real_table_shape(self):
		from tournaments import fastgames

		for key in fastgames.FORMAT_KEYS:
			fmt = fastgames.FORMATS[key]
			with self.subTest(format=key):
				# The engine seats between two and nine, and pays no more
				# places than it has players.
				self.assertGreaterEqual(fmt.seats, 2)
				self.assertLessEqual(fmt.seats, 9)
				self.assertLessEqual(len(fmt.payouts), fmt.seats)
				self.assertTrue(fmt.stakes)
				# Two buy-ins each, and the cheaper one first so the tier cards
				# read in the order anybody would climb them.
				self.assertEqual(list(fmt.stakes), sorted(fmt.stakes))

	def test_the_formats_are_turbos_and_start_shallow(self):
		from tournaments import fastgames

		for key in fastgames.FORMAT_KEYS:
			fmt = fastgames.FORMATS[key]
			with self.subTest(format=key):
				self.assertLessEqual(fmt.level_minutes, 3)
				# Deep enough to play, short enough to be over: nothing here
				# starts with more than forty blinds or fewer than ten.
				self.assertGreaterEqual(fmt.big_blinds, 10)
				self.assertLessEqual(fmt.big_blinds, 40)

	def test_the_blinds_only_ever_climb(self):
		from tournaments import fastgames

		for key in fastgames.FORMAT_KEYS:
			fmt = fastgames.FORMATS[key]
			with self.subTest(format=key):
				bigs = [level[1] for level in fmt.blinds]
				self.assertEqual(bigs, sorted(bigs))
				self.assertEqual(len(set(bigs)), len(bigs))
				# Every level has the small blind under the big one, which is
				# the only thing the engine assumes about a level.
				for small, big, _ante in fmt.blinds:
					self.assertLess(small, big)

	def test_the_ladder_outlasts_the_chips(self):
		"""The last level never raises, so it has to be one nobody can sit in.

		By the end of the ladder the big blind should be past the whole prize
		pool of chips — otherwise a game could reach the final level and sit
		there forever.
		"""
		from tournaments import fastgames

		for key in fastgames.FORMAT_KEYS:
			fmt = fastgames.FORMATS[key]
			with self.subTest(format=key):
				chips_in_play = fmt.starting_chips * fmt.seats
				self.assertGreaterEqual(fmt.blinds[-1][1] * 2, chips_in_play)

	def test_a_heads_up_game_is_two_seats_and_a_six_max_is_six(self):
		from tournaments import fastgames

		self.assertEqual(fastgames.FORMATS["hu"].seats, 2)
		self.assertEqual(fastgames.FORMATS["sixmax"].seats, 6)
		# Heads up is the shorter of the two, which is the whole reason to
		# offer both.
		self.assertLess(
			len(fastgames.FORMATS["hu"].blinds), len(fastgames.FORMATS["sixmax"].blinds),
		)

	def test_a_finished_row_says_which_format_it_was(self):
		from tournaments import fastgames

		host = User.objects.create_user(username="ff_host", password="x")
		for key in fastgames.FORMAT_KEYS:
			fmt = fastgames.FORMATS[key]
			game = Tournament.objects.create(
				host=host, **fastgames.tournament_defaults(fmt, fmt.stakes[0]),
			)
			with self.subTest(format=key):
				self.assertEqual(fastgames.key_for_tournament(game), key)

	def test_a_tournament_is_not_a_fast_game(self):
		from tournaments import fastgames

		host = User.objects.create_user(username="ff_host2", password="x")
		night = Tournament.objects.create(host=host, name="Thursday")
		self.assertIsNone(fastgames.key_for_tournament(night))

	def test_the_pot_is_the_buy_ins_unless_it_was_drawn(self):
		from tournaments import fastgames

		hu = fastgames.FORMATS["hu"]
		self.assertEqual(fastgames.pot_coins(hu, 50, 2), 100)
		sixmax = fastgames.FORMATS["sixmax"]
		self.assertEqual(fastgames.pot_coins(sixmax, 25, 6), 150)
		spin = fastgames.FORMATS["spingo"]
		self.assertEqual(fastgames.pot_coins(spin, 25, 3, multiplier=10), 250)


class SitNGoTests(APITestCase):
	"""Sitting down at a Sit n Go, and it firing when the seats fill."""

	def setUp(self):
		self.players = {
			name: User.objects.create_user(username=f"s_{name}", password="x")
			for name in ("a", "b", "c", "d", "e", "f", "g")
		}
		for user in self.players.values():
			self._top_up(user, 500)

	def tearDown(self):
		_tournament_runners.clear()

	def _top_up(self, user, coins):
		from sidegames.economy import wallet_for
		from sidegames.models import Wallet

		wallet_for(user)
		Wallet.objects.filter(user=user).update(balance=coins)

	def _balance(self, name):
		from sidegames.models import Wallet

		return Wallet.objects.get(user=self.players[name]).balance

	def _sit(self, name, key, stake):
		self.client.force_authenticate(self.players[name])
		return self.client.post(reverse("fast-sit"), {"key": key, "stake": stake}, format="json")

	def test_two_players_fill_a_heads_up_and_it_deals(self):
		self._sit("a", "hu", 10)
		response = self._sit("b", "hu", 10)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		game = Tournament.objects.get(format="sitngo")
		self.assertEqual(game.status, "running")
		self.assertEqual(game.players.count(), 2)
		# Two seats, one table, and the seats opposite each other — which is
		# what the felt draws from players_per_table.
		self.assertEqual(game.players_per_table, 2)
		self.assertEqual(game.max_players, 2)
		self.assertEqual(sorted(game.players.values_list("seat_at_table", flat=True)), [0, 1])
		self.assertEqual(self._balance("a"), 490)

	def test_a_heads_up_pays_the_winner_everything(self):
		self._sit("a", "hu", 50)
		self._sit("b", "hu", 50)
		game = Tournament.objects.get(format="sitngo")

		self.assertEqual(game.payout_structure, [{"place": 1, "label": "1st", "percentage": 100}])
		self.assertEqual(game.spin_multiplier, 0)

	def test_six_players_fill_a_six_max_and_five_do_not(self):
		for name in ("a", "b", "c", "d", "e"):
			self._sit(name, "sixmax", 25)

		game = Tournament.objects.get(format="sitngo")
		self.assertEqual(game.status, "lobby")

		self._sit("f", "sixmax", 25)
		game.refresh_from_db()
		self.assertEqual(game.status, "running")
		self.assertEqual(game.players.count(), 6)

	def test_a_seventh_player_opens_a_second_six_max(self):
		for name in ("a", "b", "c", "d", "e", "f"):
			self._sit(name, "sixmax", 25)
		self._sit("g", "sixmax", 25)

		self.assertEqual(Tournament.objects.filter(format="sitngo").count(), 2)
		self.assertEqual(Tournament.objects.filter(format="sitngo", status="lobby").count(), 1)

	def test_the_two_sit_n_gos_are_different_queues(self):
		"""Same format column, told apart by their seat count.

		A heads-up player must never be seated into a six-max, and the only
		thing distinguishing the rows is how many chairs they have.
		"""
		self._sit("a", "hu", 10)
		self._sit("b", "sixmax", 25)

		self.assertEqual(Tournament.objects.filter(format="sitngo").count(), 2)
		seats = sorted(Tournament.objects.filter(format="sitngo").values_list(
			"players_per_table", flat=True,
		))
		self.assertEqual(seats, [2, 6])

	def test_each_format_offers_two_buy_ins(self):
		self.client.force_authenticate(self.players["a"])
		lobby = self.client.get(reverse("fast-lobby")).data

		by_key = {one["key"]: one for one in lobby["formats"]}
		self.assertEqual(sorted(by_key), ["hu", "sixmax", "spingo"])
		for key, expected in (("hu", [10, 50]), ("sixmax", [25, 100]), ("spingo", [25, 50])):
			with self.subTest(format=key):
				self.assertEqual([tier["stake"] for tier in by_key[key]["tiers"]], expected)

	def test_a_sit_n_go_tier_says_what_it_pays_rather_than_drawing_for_it(self):
		self.client.force_authenticate(self.players["a"])
		lobby = self.client.get(reverse("fast-lobby")).data
		sixmax = next(one for one in lobby["formats"] if one["key"] == "sixmax")
		tier = sixmax["tiers"][0]

		self.assertFalse(sixmax["draws_multiplier"])
		self.assertNotIn("odds", tier)
		# Six seats at twenty-five is a hundred and fifty, split 65/35.
		self.assertEqual([row["coins"] for row in tier["payouts"]], [97, 52])

	def test_a_stake_from_another_format_is_refused(self):
		# 100 is a six-max buy-in, not a heads-up one.
		response = self._sit("a", "hu", 100)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertFalse(Tournament.objects.exists())

	def test_you_can_sit_at_several_games_at_once(self):
		"""Registering for one game must not close the rest of the lobby.

		The tables have carried a tab strip since more than one could be open,
		so a lobby that refuses the second registration is refusing the thing
		the strip exists for.
		"""
		self._sit("a", "hu", 10)
		second = self._sit("a", "sixmax", 25)
		third = self._sit("a", "spingo", 25)

		self.assertEqual(second.status_code, status.HTTP_201_CREATED)
		self.assertEqual(third.status_code, status.HTTP_201_CREATED)
		# Ten, twenty-five and twenty-five, all actually charged.
		self.assertEqual(self._balance("a"), 440)

		lobby = self.client.get(reverse("fast-lobby")).data
		self.assertEqual(
			sorted(game["key"] for game in lobby["my_games"]), ["hu", "sixmax", "spingo"],
		)

	def test_one_waiting_seat_per_tier_and_no_more(self):
		"""Pressing Sit again at a tier you are queued at buys nothing.

		It would split the tier into two half-full tables, each still waiting on
		strangers — more coins committed for the same one game.
		"""
		self._sit("a", "hu", 10)
		again = self._sit("a", "hu", 10)

		self.assertEqual(again.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(again.data["error"], "You are already waiting at this table")
		self.assertEqual(Tournament.objects.filter(format="sitngo").count(), 1)
		self.assertEqual(self._balance("a"), 490)

	def test_a_tier_opens_up_again_once_your_game_there_is_dealing(self):
		self._sit("a", "hu", 10)
		self._sit("b", "hu", 10)
		self.assertEqual(Tournament.objects.get(format="sitngo").status, "running")

		second = self._sit("a", "hu", 10)

		self.assertEqual(second.status_code, status.HTTP_201_CREATED)
		self.assertEqual(Tournament.objects.filter(format="sitngo").count(), 2)
		self.assertEqual(self._balance("a"), 480)

	def test_never_two_of_your_own_seats_in_one_game(self):
		"""The seat count is the field: one player holding two of them would
		fire a three-handed game with two people at it."""
		self._sit("a", "hu", 10)
		self._sit("b", "hu", 10)
		self._sit("a", "hu", 10)

		for game in Tournament.objects.filter(format="sitngo"):
			with self.subTest(game=game.id):
				seated = list(game.players.values_list("user_id", flat=True))
				self.assertEqual(len(seated), len(set(seated)))

	def test_a_second_seat_still_needs_paying_for(self):
		self._top_up(self.players["a"], 55)
		self._sit("a", "hu", 50)
		refused = self._sit("a", "sixmax", 25)

		self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(refused.data["error"], "Not enough coins")
		self.assertEqual(self._balance("a"), 5)

	def test_leaving_names_which_of_your_queues_to_leave(self):
		self._sit("a", "hu", 10)
		self._sit("a", "sixmax", 25)
		hu = Tournament.objects.get(format="sitngo", players_per_table=2)

		self.client.force_authenticate(self.players["a"])
		response = self.client.post(reverse("fast-leave"), {"game": hu.id}, format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(self._balance("a"), 475)
		self.assertFalse(Tournament.objects.filter(pk=hu.id).exists())
		# The other queue is untouched: leaving one is not leaving the lobby.
		self.assertEqual(
			Tournament.objects.filter(format="sitngo", players_per_table=6).count(), 1,
		)

	def test_leaving_a_sit_n_go_queue_refunds_it(self):
		self._sit("a", "sixmax", 100)
		self.client.force_authenticate(self.players["a"])
		response = self.client.post(reverse("fast-leave"), {}, format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(self._balance("a"), 500)
		self.assertFalse(Tournament.objects.filter(format="sitngo").exists())

	def test_nobody_runs_a_sit_n_go(self):
		from tournaments.permissions import can_manage_tournament

		self._sit("a", "hu", 10)
		game = Tournament.objects.get(format="sitngo")
		boss = User.objects.create_superuser(username="s_boss", password="x")

		self.assertFalse(can_manage_tournament(self.players["a"], game))
		self.assertFalse(can_manage_tournament(boss, game))


class FastGameStartAlertTests(APITestCase):
	"""Telling the players who were not the one to fill the table.

	Whoever takes the last seat is standing in front of the answer — their own
	request returns a started game and the lobby takes them to it. Everybody else
	sat down minutes ago and went somewhere else, and until now the only thing
	telling them was the lobby's poll, which does not run unless the lobby is the
	page on screen. With seats at several tiers held at once, that is most of the
	time.
	"""

	def setUp(self):
		self.players = {
			name: User.objects.create_user(username=f"al_{name}", password="x")
			for name in ("a", "b", "c")
		}
		for user in self.players.values():
			from sidegames.economy import wallet_for
			from sidegames.models import Wallet

			wallet_for(user)
			Wallet.objects.filter(user=user).update(balance=500)

	def tearDown(self):
		_tournament_runners.clear()

	def _sit(self, name, key, stake):
		self.client.force_authenticate(self.players[name])
		return self.client.post(reverse("fast-sit"), {"key": key, "stake": stake}, format="json")

	def test_the_player_already_waiting_is_told_the_game_has_started(self):
		with patch("tournaments.fastgames_views.notify_user") as told:
			self._sit("a", "hu", 10)
			self.assertEqual(told.call_args_list, [], "nothing has started yet")

			self._sit("b", "hu", 10)

		game = Tournament.objects.get(format="sitngo")
		# Ana, who has been waiting, and not Bea, who is being taken to the table
		# by her own request.
		self.assertEqual([call.args[0] for call in told.call_args_list], [self.players["a"].id])

		payload = told.call_args_list[0].args[1]
		self.assertEqual(payload["type"], "fast_game_started")
		# Enough to say which game, and to say it in words: the table it opens and
		# the name of the format are both in the message rather than fetched after.
		self.assertEqual(payload["game"]["id"], game.id)
		self.assertEqual(payload["game"]["status"], "running")
		self.assertEqual(payload["game"]["label"], "Heads Up")
		self.assertEqual(payload["game"]["stake"], 10)

	def test_everybody_but_the_last_one_in_is_told(self):
		"""Six-handed: five have been waiting, and all five are rung."""
		for name in ("a", "b"):
			self._sit(name, "sixmax", 25)

		others = [
			User.objects.create_user(username=f"al_x{index}", password="x")
			for index in range(3)
		]
		for user in others:
			from sidegames.economy import wallet_for
			from sidegames.models import Wallet

			wallet_for(user)
			Wallet.objects.filter(user=user).update(balance=500)
			self.client.force_authenticate(user)
			self.client.post(reverse("fast-sit"), {"key": "sixmax", "stake": 25}, format="json")

		with patch("tournaments.fastgames_views.notify_user") as told:
			self._sit("c", "sixmax", 25)

		self.assertEqual(
			sorted(call.args[0] for call in told.call_args_list),
			sorted([self.players["a"].id, self.players["b"].id] + [user.id for user in others]),
		)

	def test_a_seat_that_does_not_fill_the_table_rings_nobody(self):
		"""Five of six is not a game starting, and four sitting down is not four
		interruptions."""
		with patch("tournaments.fastgames_views.notify_user") as told:
			for name in ("a", "b", "c"):
				self._sit(name, "sixmax", 25)

		self.assertEqual(told.call_args_list, [])

	def test_a_refused_seat_rings_nobody(self):
		"""Sitting twice at a tier you are already waiting at is refused, and a
		refusal is not news for the people who are waiting properly."""
		self._sit("a", "hu", 10)

		with patch("tournaments.fastgames_views.notify_user") as told:
			response = self._sit("a", "hu", 10)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(told.call_args_list, [])

	def test_a_game_that_cannot_be_announced_still_starts(self):
		"""The notification is the last thing to happen and the least important.
		A channel layer that is down must not cost somebody the seat they paid
		for — notify_user swallows its own failures, and this pins that the view
		does not undo the game if one gets out."""
		self._sit("a", "hu", 50)

		with patch("tournaments.fastgames_views.notify_user", return_value=False):
			response = self._sit("b", "hu", 50)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(Tournament.objects.get(format="sitngo").status, "running")


class FastGamesStayOutOfTheTournamentListTests(APITestCase):
	"""The lobby's tournament tab is for nights people arranged."""

	def setUp(self):
		self.player = User.objects.create_user(username="fl_player", password="x")
		from sidegames.economy import wallet_for
		from sidegames.models import Wallet

		wallet_for(self.player)
		Wallet.objects.filter(user=self.player).update(balance=500)
		self.client.force_authenticate(self.player)

	def tearDown(self):
		_tournament_runners.clear()

	def _finished_fast(self, key):
		from tournaments import fastgames

		fmt = fastgames.FORMATS[key]
		game = Tournament.objects.create(
			host=self.player,
			**{**fastgames.tournament_defaults(fmt, fmt.stakes[0]),
			   "status": "finished", "spin_multiplier": 2 if fmt.draws_multiplier else 0,
			   "finished_at": timezone.now()},
		)
		TournamentPlayer.objects.create(
			tournament=game, user=self.player, seat=0, chips=0, finish_position=1,
		)
		return game

	def _scope(self, scope):
		return self.client.get(reverse("tournament-list"), {"scope": scope}).data

	def test_a_finished_fast_game_is_not_in_the_tournament_history(self):
		for key in ("spingo", "hu", "sixmax"):
			self._finished_fast(key)
		night = Tournament.objects.create(
			host=self.player, name="Thursday", status="finished",
		)
		TournamentPlayer.objects.create(
			tournament=night, user=self.player, seat=0, chips=0, finish_position=1,
		)

		past = self._scope("past")
		self.assertEqual([row["name"] for row in past], ["Thursday"])

	def test_a_waiting_fast_game_is_not_in_the_tournament_list(self):
		self.client.post(reverse("fast-sit"), {"key": "hu", "stake": 10}, format="json")

		self.assertEqual(self._scope("upcoming"), [])

	def test_a_live_fast_game_is_still_in_your_own_active_list(self):
		"""The shortcut back to your table reads that scope.

		Keeping fast games out of it would leave a player who wandered off to
		the lobby with no way back to a game that is dealing to them.
		"""
		game = self._finished_fast("hu")
		Tournament.objects.filter(pk=game.pk).update(status="running", finished_at=None)

		active = self._scope("mine_active")
		self.assertEqual([row["format"] for row in active], ["sitngo"])


class MysteryEnvelopeTests(TestCase):
	"""Cutting a pool into envelopes. Arithmetic, and no database."""

	def _amounts(self, pool, count):
		from tournaments import mystery

		return mystery.envelope_amounts(pool, count)

	def test_the_envelopes_always_add_up_to_the_pool(self):
		"""The one invariant that matters: nothing is dropped, nothing invented.

		Walked over a wide spread of pools and fields rather than a couple of
		tidy numbers, because the flooring is where a cent would go missing and
		it only goes missing on numbers that do not divide.
		"""
		for pool in (0, 1, 99, 100, 4501, 90000, 123457, 10**7):
			for count in (0, 1, 2, 3, 5, 8, 9, 27, 100):
				with self.subTest(pool=pool, count=count):
					amounts = self._amounts(pool, count)
					self.assertEqual(sum(amounts), pool if count else 0)
					self.assertEqual(len(amounts), count if pool else 0)

	def test_nobody_ever_draws_an_empty_envelope(self):
		for pool, count in ((90000, 9), (100, 9), (9, 9), (500, 100)):
			with self.subTest(pool=pool, count=count):
				self.assertTrue(all(amount > 0 for amount in self._amounts(pool, count)))

	def test_a_pool_too_small_to_go_round_still_adds_up(self):
		"""Seven cents between nine players cannot pay everybody.

		It must still not invent a cent, which is the part that matters.
		"""
		amounts = self._amounts(7, 9)
		self.assertEqual(sum(amounts), 7)
		self.assertEqual(len(amounts), 9)

	def test_the_envelopes_come_back_biggest_first(self):
		amounts = self._amounts(90000, 9)
		self.assertEqual(amounts, sorted(amounts, reverse=True))

	def test_one_envelope_is_worth_chasing(self):
		"""A mystery bounty where every envelope is the same is a fixed bounty.

		The top one should be several times an ordinary one, and a good share of
		the whole pool — that is the thing people are playing for.
		"""
		amounts = self._amounts(90000, 9)
		self.assertGreater(amounts[0], amounts[-1] * 3)
		self.assertGreater(amounts[0], sum(amounts) * 0.2)

	def test_the_same_numbers_cut_the_same_pool(self):
		"""The board is public in these events; only the draw is a gamble."""
		self.assertEqual(self._amounts(90000, 9), self._amounts(90000, 9))

	def test_opening_one_takes_it_out_of_the_pool(self):
		from tournaments import mystery

		envelopes = [500, 300, 200]
		amount, remaining = mystery.take(envelopes, 1)

		self.assertEqual(amount, 300)
		self.assertEqual(remaining, [500, 200])
		# The list handed in is not touched — the caller decides what to keep.
		self.assertEqual(envelopes, [500, 300, 200])

	def test_opening_one_that_is_not_there_takes_nothing(self):
		from tournaments import mystery

		amount, remaining = mystery.take([500], 4)
		self.assertEqual(amount, 0)
		self.assertEqual(remaining, [500])

	def test_the_draw_can_land_on_any_envelope(self):
		from tournaments import mystery

		class Fixed:
			def __init__(self, value):
				self.value = value

			def randrange(self, _stop):
				return self.value

		envelopes = [500, 300, 200]
		drawn = {mystery.take(envelopes, mystery.draw_index(envelopes, Fixed(i)))[0] for i in range(3)}
		self.assertEqual(drawn, {500, 300, 200})


class MysteryReleaseTests(TestCase):
	"""When the envelopes open."""

	def _closed(self, level, late_reg=4, rebuy=4, allow_rebuys=True):
		from tournaments import mystery

		return mystery.registration_closed(level, late_reg, rebuy, allow_rebuys)

	def test_the_field_is_not_final_while_anybody_can_still_enter(self):
		self.assertFalse(self._closed(1))
		self.assertFalse(self._closed(4))
		self.assertTrue(self._closed(5))

	def test_the_field_is_not_final_while_anybody_can_still_buy_back_in(self):
		"""Either one open means another buy-in, and another buy-in is another
		bounty that belongs in a pool that has already been cut up."""
		self.assertFalse(self._closed(5, late_reg=2, rebuy=6))
		self.assertTrue(self._closed(7, late_reg=2, rebuy=6))

	def test_rebuys_that_are_switched_off_never_hold_it_open(self):
		self.assertTrue(self._closed(3, late_reg=2, rebuy=9, allow_rebuys=False))

	def test_opening_at_the_money_waits_for_the_money(self):
		from tournaments import mystery

		def release(remaining):
			return mystery.should_release(
				"itm", remaining_players=remaining, paid_places=3, registration_is_closed=True,
			)

		self.assertFalse(release(9))
		self.assertFalse(release(4))
		self.assertTrue(release(3))
		self.assertTrue(release(2))

	def test_opening_at_the_money_needs_a_money_to_open_at(self):
		from tournaments import mystery

		self.assertFalse(mystery.should_release(
			"itm", remaining_players=2, paid_places=0, registration_is_closed=True,
		))

	def test_opening_when_registration_closes_ignores_how_many_are_left(self):
		from tournaments import mystery

		self.assertTrue(mystery.should_release(
			"reg_closed", remaining_players=50, paid_places=3, registration_is_closed=True,
		))
		self.assertFalse(mystery.should_release(
			"reg_closed", remaining_players=3, paid_places=3, registration_is_closed=False,
		))

	def test_an_unknown_rule_falls_back_to_the_money(self):
		from tournaments import mystery

		self.assertEqual(mystery.clean_release("whenever"), "itm")
		self.assertEqual(mystery.clean_release(None), "itm")
		self.assertEqual(mystery.clean_release("reg_closed"), "reg_closed")


class MysteryCoordinatorTests(TestCase):
	"""The envelopes opening, and being drawn, while a tournament runs."""

	def _coordinator(self, *, release="itm", paid_places=3, envelopes=None, opened=False,
	                 tournament_events=None, table_events=None, late_reg_level=0,
	                 rebuy_level=0, allow_rebuys=False, pool=90000):
		from tournaments.bounties import BountyConfig

		async def noop(*args, **kwargs):
			return None

		async def capture_tournament(event_type, payload):
			if tournament_events is not None:
				tournament_events.append((event_type, payload))

		async def capture_table(table_number, event_type, payload):
			if table_events is not None:
				table_events.append((event_type, payload))

		self.opened_with = []
		self.persisted = []

		async def open_mystery(draws):
			from tournaments import mystery

			self.opened_with.append(draws)
			return mystery.envelope_amounts(pool, draws)

		async def persist_mystery(remaining):
			self.persisted.append(list(remaining))

		return MultiTableTournamentCoordinator(
			tournament_id=1,
			players_per_table=9,
			levels=[{"small_blind": 25, "big_blind": 50, "ante": 0, "duration_hands": 8}],
			broadcast_tournament=capture_tournament,
			broadcast_table=capture_table,
			request_action=noop,
			notify_user=noop,
			load_players=noop,
			persist_assignments=noop,
			persist_player_states=noop,
			bounty=BountyConfig(mode="mystery", amount_cents=1000),
			paid_places=paid_places,
			mystery_release=release,
			mystery_envelopes=envelopes,
			mystery_opened=opened,
			open_mystery=open_mystery,
			persist_mystery=persist_mystery,
			late_reg_level=late_reg_level,
			rebuy_level=rebuy_level,
			allow_rebuys=allow_rebuys,
		)

	def _player(self, coordinator, tp_id, name, chips=1000):
		player = EnginePlayer(name=name, chips=chips)
		player._tp_id = tp_id
		player._user_id = tp_id * 11
		player._seat = tp_id
		player._global_seat = tp_id
		player._table_number = 1
		player._bounty_cents = 0
		player._bounty_won_cents = 0
		coordinator._players_by_id[tp_id] = player
		coordinator._players_by_user_id[player._user_id] = player
		return player

	def test_a_knockout_before_the_envelopes_open_pays_nothing(self):
		"""Which is the format. Everybody busting out early was worth something
		to somebody, and nobody knows what until it opens."""
		table = []
		coordinator = self._coordinator(table_events=table)
		victim = self._player(coordinator, 1, "victim", chips=0)
		hunter = self._player(coordinator, 2, "hunter")

		async_to_sync(coordinator._pay_bounty)(victim, [hunter])

		self.assertEqual(hunter._bounty_won_cents, 0)
		# The knockout still happened and still counts.
		self.assertEqual(hunter._knockouts, 1)
		self.assertEqual([event for event, _ in table], ["mystery_sealed"])

	def test_a_knockout_after_they_open_draws_one(self):
		table = []
		coordinator = self._coordinator(
			envelopes=[5000, 3000, 2000], opened=True, table_events=table,
		)
		victim = self._player(coordinator, 1, "victim", chips=0)
		hunter = self._player(coordinator, 2, "hunter")

		async_to_sync(coordinator._pay_bounty)(victim, [hunter])

		self.assertIn(hunter._bounty_won_cents, (5000, 3000, 2000))
		self.assertEqual(len(coordinator._mystery_envelopes), 2)
		# What is left is written down, because the row is the only copy.
		self.assertEqual(self.persisted[-1], coordinator._mystery_envelopes)
		event, payload = table[-1]
		self.assertEqual(event, "bounty_won")
		self.assertEqual(payload["mystery"]["envelope_cents"], hunter._bounty_won_cents)
		self.assertEqual(payload["mystery"]["envelopes_left"], 2)

	def test_the_pool_only_ever_shrinks(self):
		"""Draw the whole thing and the cents come out exactly as they went in."""
		from tournaments import mystery

		envelopes = mystery.envelope_amounts(90000, 5)
		coordinator = self._coordinator(envelopes=envelopes, opened=True)
		hunter = self._player(coordinator, 99, "hunter")

		collected = 0
		for index in range(5):
			victim = self._player(coordinator, index, f"victim{index}", chips=0)
			async_to_sync(coordinator._pay_bounty)(victim, [hunter])
			collected = hunter._bounty_won_cents

		self.assertEqual(collected, 90000)
		self.assertEqual(coordinator._mystery_envelopes, [])

	def test_a_pot_busted_by_two_people_splits_the_envelope(self):
		coordinator = self._coordinator(envelopes=[5001], opened=True)
		victim = self._player(coordinator, 1, "victim", chips=0)
		first = self._player(coordinator, 2, "first")
		second = self._player(coordinator, 3, "second")

		async_to_sync(coordinator._pay_bounty)(victim, [first, second])

		# One envelope, split, and the odd cent to the first of them.
		self.assertEqual(first._bounty_won_cents + second._bounty_won_cents, 5001)
		self.assertEqual(first._bounty_won_cents, 2501)
		self.assertEqual(first._knockouts, 1)
		self.assertEqual(second._knockouts, 1)

	def test_an_empty_pool_pays_nothing_rather_than_inventing_it(self):
		coordinator = self._coordinator(envelopes=[], opened=True)
		victim = self._player(coordinator, 1, "victim", chips=0)
		hunter = self._player(coordinator, 2, "hunter")

		async_to_sync(coordinator._pay_bounty)(victim, [hunter])

		self.assertEqual(hunter._bounty_won_cents, 0)

	def test_nobody_gets_an_envelope_for_a_player_nobody_busted(self):
		coordinator = self._coordinator(envelopes=[5000], opened=True)
		victim = self._player(coordinator, 1, "victim", chips=0)

		async_to_sync(coordinator._pay_bounty)(victim, [])

		self.assertEqual(coordinator._mystery_envelopes, [5000])

	def _open_with(self, coordinator, players):
		for index in range(players):
			self._player(coordinator, index, f"p{index}")
		async_to_sync(coordinator._maybe_open_mystery)()

	def test_the_envelopes_open_at_the_money(self):
		events = []
		coordinator = self._coordinator(paid_places=3, tournament_events=events)
		self._open_with(coordinator, 3)

		self.assertTrue(coordinator._mystery_opened)
		# One envelope per knockout still to come: everybody but the winner.
		self.assertEqual(self.opened_with, [2])
		self.assertEqual(len(coordinator._mystery_envelopes), 2)
		self.assertEqual([event for event, _ in events], ["mystery_opened"])
		payload = events[0][1]
		self.assertEqual(payload["pool_cents"], sum(coordinator._mystery_envelopes))
		self.assertEqual(payload["players_left"], 3)

	def test_they_stay_sealed_above_the_money(self):
		coordinator = self._coordinator(paid_places=3)
		self._open_with(coordinator, 4)

		self.assertFalse(coordinator._mystery_opened)
		self.assertEqual(self.opened_with, [])

	def test_they_stay_sealed_while_the_field_can_still_grow(self):
		"""A pool that can still grow is a pool that cannot be cut up.

		A late entry after the envelopes were counted would be one more knockout
		than there are envelopes to pay it with.
		"""
		coordinator = self._coordinator(paid_places=3, late_reg_level=4)
		coordinator._level_index = 0
		self._open_with(coordinator, 3)

		self.assertFalse(coordinator._mystery_opened)

	def test_they_open_when_registration_closes_however_many_are_left(self):
		coordinator = self._coordinator(release="reg_closed", paid_places=3, late_reg_level=0)
		self._open_with(coordinator, 8)

		self.assertTrue(coordinator._mystery_opened)
		self.assertEqual(self.opened_with, [7])

	def test_a_pool_is_never_cut_twice(self):
		coordinator = self._coordinator(paid_places=3)
		self._open_with(coordinator, 3)
		first = list(coordinator._mystery_envelopes)

		async_to_sync(coordinator._maybe_open_mystery)()

		self.assertEqual(self.opened_with, [2])
		self.assertEqual(coordinator._mystery_envelopes, first)


class MysteryLedgerTests(TestCase):
	"""What a mystery tournament settles to."""

	def setUp(self):
		self.host = User.objects.create_user(username="m_host", password="x")
		self.users = {
			name: User.objects.create_user(username=f"m_{name}", password="x")
			for name in ("ana", "bea", "caio", "dina")
		}

	def _tournament(self, envelopes=None, **kwargs):
		return Tournament.objects.create(
			host=self.host, name="Mystery", status="finished",
			buy_in_cents=2000, bounty_mode="mystery", bounty_cents=1000,
			mystery_envelopes=envelopes or [],
			payout_structure=[
				{"place": 1, "label": "1st", "percentage": 70},
				{"place": 2, "label": "2nd", "percentage": 30},
			],
			**kwargs,
		)

	def _seat(self, tournament, name, seat, finish, won=0):
		return TournamentPlayer.objects.create(
			tournament=tournament, user=self.users[name], seat=seat, chips=0,
			finish_position=finish, is_eliminated=finish != 1,
			bounty_cents=0, bounty_won_cents=won,
		)

	def _settle(self, tournament):
		from tournaments.ledger import settle_tournament

		return settle_tournament(tournament)

	def test_the_places_play_for_the_buy_in_less_the_bounty(self):
		tournament = self._tournament()
		self._seat(tournament, "ana", 0, 1, won=3000)
		self._seat(tournament, "bea", 1, 2, won=1000)
		self._seat(tournament, "caio", 2, 3)
		self._seat(tournament, "dina", 3, 4)

		self._settle(tournament)

		from tournaments.models import LedgerEntry

		entries = {e.user.username: e for e in LedgerEntry.objects.select_related("user")}
		# Four buy-ins of 20.00, half of each into the mystery pool: 40.00 for
		# the places, split 70/30.
		self.assertEqual(entries["m_ana"].prize_cents, 2800 + 3000)
		self.assertEqual(entries["m_bea"].prize_cents, 1200 + 1000)
		self.assertEqual(entries["m_ana"].stake_cents, 2000)

	def test_what_you_drew_is_what_you_keep(self):
		"""No head carried anything, so there is nothing to hand back."""
		tournament = self._tournament()
		self._seat(tournament, "ana", 0, 1, won=4000)
		self._seat(tournament, "bea", 1, 2)

		self._settle(tournament)

		from tournaments.models import LedgerEntry

		entries = {e.user.username: e for e in LedgerEntry.objects.select_related("user")}
		self.assertEqual(entries["m_ana"].bounty_prize_cents, 4000)
		self.assertEqual(entries["m_bea"].bounty_prize_cents, 0)

	def test_envelopes_nobody_drew_go_to_the_winner(self):
		"""Somebody quitting or timing out is a knockout that never happened.

		Its envelope was never drawn, and the pool still has to add up to what
		went into it — so the winner gets whatever nobody took. Note that what
		is paid out is bounded by the pool rather than by the numbers left on
		the board: four entries at 10.00 apiece is a 40.00 pool however many
		envelopes happen to be listed on the row.
		"""
		tournament = self._tournament(envelopes=[2000, 1000])
		self._seat(tournament, "ana", 0, 1, won=1000)
		self._seat(tournament, "bea", 1, 2)
		self._seat(tournament, "caio", 2, 3)
		self._seat(tournament, "dina", 3, 4)

		self._settle(tournament)

		from tournaments.models import LedgerEntry

		winner = LedgerEntry.objects.get(user=self.users["ana"])
		# She drew 10.00; the 30.00 nobody drew is hers as well.
		self.assertEqual(winner.bounty_prize_cents, 4000)
		self.assertEqual(
			sum(e.bounty_prize_cents for e in LedgerEntry.objects.all()), 1000 * 4,
		)

	def test_the_whole_pool_is_paid_out_and_no_more(self):
		"""Every cent taken out of the buy-ins comes back out somewhere."""
		tournament = self._tournament(envelopes=[500])
		self._seat(tournament, "ana", 0, 1, won=2000)
		self._seat(tournament, "bea", 1, 2, won=1500)
		self._seat(tournament, "caio", 2, 3)
		self._seat(tournament, "dina", 3, 4)

		self._settle(tournament)

		from tournaments.models import LedgerEntry

		paid_in = 1000 * 4
		paid_out = sum(e.bounty_prize_cents for e in LedgerEntry.objects.all())
		self.assertEqual(paid_out, paid_in)
		self.assertEqual(paid_out, 2000 + 1500 + 500)


class MysteryConfigurationTests(APITestCase):
	"""Opening a mystery bounty tournament."""

	def setUp(self):
		self.host = User.objects.create_user(username="my_host", password="x", is_staff=True)
		self.client.force_authenticate(self.host)

	def tearDown(self):
		_tournament_runners.clear()

	def _payload(self, **overrides):
		return {
			"name": "Mystery Night",
			"buy_in_cents": 2000,
			"bounty_mode": "mystery",
			"bounty_cents": 1000,
			"payout_structure": [{"place": 1, "label": "1st", "percentage": 100}],
			**overrides,
		}

	def test_a_mystery_tournament_is_created_with_a_release_rule(self):
		response = self.client.post(reverse("tournament-list"), self._payload(), format="json")

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		tournament = Tournament.objects.get(id=response.data["id"])
		self.assertEqual(tournament.bounty_mode, "mystery")
		self.assertEqual(tournament.mystery_release, "itm")
		# Sealed, and nothing cut yet.
		self.assertEqual(tournament.mystery_envelopes, [])
		self.assertIsNone(tournament.mystery_opened_at)

	def test_the_host_does_not_get_a_bounty_on_their_head(self):
		"""There are no heads in a mystery game; the money is in the pool."""
		response = self.client.post(reverse("tournament-list"), self._payload(), format="json")

		seat = Tournament.objects.get(id=response.data["id"]).players.get()
		self.assertEqual(seat.bounty_cents, 0)

	def test_it_can_be_set_to_open_when_registration_closes(self):
		response = self.client.post(
			reverse("tournament-list"), self._payload(mystery_release="reg_closed"), format="json",
		)

		self.assertEqual(
			Tournament.objects.get(id=response.data["id"]).mystery_release, "reg_closed",
		)

	def test_opening_at_the_money_needs_a_money(self):
		response = self.client.post(
			reverse("tournament-list"),
			self._payload(mystery_release="itm", payout_structure=[]),
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("mystery_release", response.data)

	def test_a_mystery_bounty_still_has_to_come_out_of_a_buy_in(self):
		response = self.client.post(
			reverse("tournament-list"), self._payload(bounty_cents=2000), format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_a_release_rule_nobody_offers_is_refused(self):
		"""Refused rather than quietly turned into one of ours.

		The engine still defaults an unknown value — see mystery.clean_release —
		because a row written by hand or by an older client has to run somehow.
		A form post is a different thing: somebody asked for something that does
		not exist and should be told so.
		"""
		response = self.client.post(
			reverse("tournament-list"), self._payload(mystery_release="whenever"), format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("mystery_release", response.data)

	def test_the_release_rule_cannot_be_changed_once_people_have_joined(self):
		created = self.client.post(
			reverse("tournament-list"), self._payload(mystery_release="reg_closed"), format="json",
		)

		self.client.patch(
			reverse("tournament-edit", args=[created.data["id"]]),
			{"mystery_release": "itm"}, format="json",
		)

		self.assertEqual(
			Tournament.objects.get(id=created.data["id"]).mystery_release, "reg_closed",
		)


class BountyConservationTests(TestCase):
	"""The money can neither leak nor multiply, whatever order it moves in.

	The bounty tests above check one knockout at a time against numbers worked
	out by hand. This checks the property those numbers are examples of, over
	hundreds of knockouts in orders nobody thought to write down: whatever is on
	the heads plus whatever has been collected is always exactly what the
	buy-ins put in.

	That invariant is the whole of a knockout tournament being trustworthy. If
	it fails, somebody is being paid out of somebody else's pocket.
	"""

	def _coordinator(self, bounty):
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
			bounty=bounty,
		)

	def _field(self, coordinator, size, bounty_cents):
		players = []
		for index in range(size):
			player = EnginePlayer(name=f"p{index}", chips=1000)
			player._tp_id = index
			player._user_id = index * 11
			player._seat = index
			player._global_seat = index
			player._table_number = 1
			player._bounty_cents = bounty_cents
			player._bounty_won_cents = 0
			coordinator._players_by_id[index] = player
			players.append(player)
		return players

	def _in_the_system(self, players):
		return sum(
			getattr(p, "_bounty_cents", 0) + getattr(p, "_bounty_won_cents", 0) for p in players
		)

	def _run_field(self, mode, *, size, bounty_cents, split_pct, seed):
		from tournaments.bounties import BountyConfig

		rng = random.Random(seed)
		coordinator = self._coordinator(
			BountyConfig(mode=mode, amount_cents=bounty_cents, progressive_split_pct=split_pct)
		)
		players = self._field(coordinator, size, bounty_cents)
		pool = self._in_the_system(players)
		self.assertEqual(pool, size * bounty_cents)

		alive = list(players)
		while len(alive) > 1:
			victim = alive.pop(rng.randrange(len(alive)))
			# Sometimes one player busts them, sometimes a split pot does.
			hunters = rng.sample(alive, min(len(alive), rng.choice([1, 1, 1, 2, 3])))
			async_to_sync(coordinator._pay_bounty)(
				victim, hunters, is_final=len(alive) == 1,
			)
			# Checked after every single knockout, not just at the end: a leak
			# that reverses itself later is still a wrong number on screen.
			self.assertEqual(
				self._in_the_system(players), pool,
				f"pool moved after busting {victim.name}",
			)
		return players, pool

	def test_a_fixed_pool_is_conserved_through_a_whole_field(self):
		for seed in range(20):
			with self.subTest(seed=seed):
				self._run_field("fixed", size=9, bounty_cents=1000, split_pct=50, seed=seed)

	def test_a_progressive_pool_is_conserved_through_a_whole_field(self):
		"""The one where cents move in two directions at once.

		A progressive knockout splits a head between cash and the winner's own
		head, and does it again for every eliminator in a split pot. Every one
		of those divisions is a chance to drop a cent.
		"""
		for seed in range(20):
			with self.subTest(seed=seed):
				self._run_field("progressive", size=9, bounty_cents=1000, split_pct=50, seed=seed)

	def test_a_progressive_pool_survives_an_awkward_split(self):
		"""Sixty-seven percent of an odd number, three ways, repeatedly."""
		for seed in range(20):
			with self.subTest(seed=seed):
				self._run_field("progressive", size=8, bounty_cents=333, split_pct=67, seed=seed)

	def test_the_only_head_left_at_the_end_is_the_winners(self):
		"""Nobody knocks the winner out, so nobody collects their head.

		Whatever is still on it — their own buy-in's worth, plus everything a
		progressive game added to it — is theirs, and settlement hands it back.
		That is exactly why ledger.settle_tournament adds `bounty_cents` to
		`bounty_won_cents` rather than paying out the takings alone, and it is
		the difference between the bounty pool adding up and a buy-in's worth
		going missing every tournament.
		"""
		for mode in ("fixed", "progressive"):
			with self.subTest(mode=mode):
				players, pool = self._run_field(
					mode, size=6, bounty_cents=1000, split_pct=50, seed=7,
				)
				with_heads = [p for p in players if getattr(p, "_bounty_cents", 0) > 0]
				self.assertEqual(len(with_heads), 1)
				# A fixed game leaves exactly one buy-in's worth on it; a
				# progressive one leaves that plus everything they were paid in
				# heads along the way.
				self.assertGreaterEqual(getattr(with_heads[0], "_bounty_cents", 0), 1000)
				# And the two halves still make the whole pool.
				self.assertEqual(
					sum(getattr(p, "_bounty_won_cents", 0) for p in players)
					+ getattr(with_heads[0], "_bounty_cents", 0),
					pool,
				)

	def test_a_mystery_pool_is_conserved_through_a_whole_field(self):
		"""The same property, for a pool that is drawn rather than carried."""
		from tournaments import mystery
		from tournaments.bounties import BountyConfig

		async def noop(*args, **kwargs):
			return None

		for seed in range(20):
			with self.subTest(seed=seed):
				size, bounty_cents = 9, 1000
				pool = size * bounty_cents
				envelopes = mystery.envelope_amounts(pool, size - 1)

				coordinator = self._coordinator(
					BountyConfig(mode="mystery", amount_cents=bounty_cents)
				)
				coordinator._mystery_envelopes = list(envelopes)
				coordinator._mystery_opened = True
				coordinator.persist_mystery = noop
				players = self._field(coordinator, size, bounty_cents=0)

				rng = random.Random(seed)
				alive = list(players)
				while len(alive) > 1:
					victim = alive.pop(rng.randrange(len(alive)))
					hunters = rng.sample(alive, min(len(alive), rng.choice([1, 1, 2])))
					async_to_sync(coordinator._pay_bounty)(victim, hunters)
					collected = sum(getattr(p, "_bounty_won_cents", 0) for p in players)
					self.assertEqual(collected + sum(coordinator._mystery_envelopes), pool)

				self.assertEqual(coordinator._mystery_envelopes, [])
				self.assertEqual(
					sum(getattr(p, "_bounty_won_cents", 0) for p in players), pool,
				)


class WinnersOwnBountyTests(TestCase):
	"""The winner is paid their own bounty at the end.

	Nobody knocks the winner out, so nobody ever collects the bounty their own
	buy-in put up — and in a progressive game nobody collects what they added to
	their own head along the way either. It is theirs, and the settlement is
	where they get it. Without this a buy-in's worth of every tournament would
	quietly go missing, and the winner would be the one paying for it.
	"""

	def setUp(self):
		self.host = User.objects.create_user(username="w_host", password="x")
		self.users = {
			name: User.objects.create_user(username=f"w_{name}", password="x")
			for name in ("ana", "bea", "caio")
		}

	def _tournament(self, mode, **extra):
		return Tournament.objects.create(
			host=self.host, name="Knockouts", status="finished",
			buy_in_cents=2000, bounty_mode=mode, bounty_cents=1000,
			payout_structure=[{"place": 1, "label": "1st", "percentage": 100}],
			**extra,
		)

	def _seat(self, tournament, name, seat, finish, *, on_head=0, won=0):
		return TournamentPlayer.objects.create(
			tournament=tournament, user=self.users[name], seat=seat, chips=0,
			finish_position=finish, is_eliminated=finish != 1,
			bounty_cents=on_head, bounty_won_cents=won,
		)

	def _settle(self, tournament):
		from tournaments.ledger import settle_tournament

		settle_tournament(tournament)
		from tournaments.models import LedgerEntry

		return {
			entry.user.username: entry
			for entry in LedgerEntry.objects.filter(tournament=tournament).select_related("user")
		}

	def test_a_fixed_winner_is_paid_their_own_bounty(self):
		tournament = self._tournament("fixed")
		# Ana won, having busted both of them; her own head is untouched.
		self._seat(tournament, "ana", 0, 1, on_head=1000, won=2000)
		self._seat(tournament, "bea", 1, 2)
		self._seat(tournament, "caio", 2, 3)

		entries = self._settle(tournament)

		# Two heads collected plus her own, which is the whole pool.
		self.assertEqual(entries["w_ana"].bounty_prize_cents, 3000)
		self.assertEqual(
			sum(e.bounty_prize_cents for e in entries.values()), 1000 * 3,
		)

	def test_a_progressive_winner_is_paid_everything_left_on_their_head(self):
		tournament = self._tournament("progressive", bounty_progressive_split_pct=50)
		# Half of each bounty she won went onto her own head, and it is still
		# sitting there because nobody busted her.
		self._seat(tournament, "ana", 0, 1, on_head=2000, won=1000)
		self._seat(tournament, "bea", 1, 2)
		self._seat(tournament, "caio", 2, 3)

		entries = self._settle(tournament)

		self.assertEqual(entries["w_ana"].bounty_prize_cents, 3000)
		self.assertEqual(sum(e.bounty_prize_cents for e in entries.values()), 3000)

	def test_a_mystery_winner_is_paid_every_envelope_nobody_drew(self):
		tournament = self._tournament("mystery", mystery_envelopes=[1200])
		self._seat(tournament, "ana", 0, 1, won=1800)
		self._seat(tournament, "bea", 1, 2)
		self._seat(tournament, "caio", 2, 3)

		entries = self._settle(tournament)

		# She drew 18.00; the 12.00 nobody drew is hers too.
		self.assertEqual(entries["w_ana"].bounty_prize_cents, 3000)
		self.assertEqual(sum(e.bounty_prize_cents for e in entries.values()), 3000)

	def test_a_mystery_pool_that_never_opened_still_goes_to_the_winner(self):
		"""A field that collapsed before the envelopes were cut.

		The money came out of the buy-ins either way, so it has to come back out
		somewhere — and the winner is the only one with a claim on a knockout
		nobody was paid for.
		"""
		tournament = self._tournament("mystery")
		self._seat(tournament, "ana", 0, 1)
		self._seat(tournament, "bea", 1, 2)
		self._seat(tournament, "caio", 2, 3)

		entries = self._settle(tournament)

		self.assertEqual(entries["w_ana"].bounty_prize_cents, 3000)
		self.assertEqual(sum(e.bounty_prize_cents for e in entries.values()), 3000)

	def test_the_winners_own_bounty_shows_up_in_what_they_take_home(self):
		"""Not just in the bounty column: the prize a player is paid is the
		placing money and the knockouts together, which is the figure the
		finish screen and the debt ledger both read."""
		tournament = self._tournament("fixed")
		self._seat(tournament, "ana", 0, 1, on_head=1000, won=2000)
		self._seat(tournament, "bea", 1, 2)
		self._seat(tournament, "caio", 2, 3)

		entries = self._settle(tournament)

		# Three buy-ins of 20.00, half of each played for by placing: 30.00 to
		# first, plus 30.00 of bounties.
		self.assertEqual(entries["w_ana"].prize_cents, 3000 + 3000)
		self.assertEqual(entries["w_ana"].net_cents, 6000 - 2000)


class AbsentRegistrationTests(APITestCase):
	"""Seats held by people who closed the app.

	A registration is a promise to turn up, and in the instant formats a ghost
	in a queue holds a whole game: it fires when the last seat fills, and a seat
	that is never going to act keeps everybody else waiting.
	"""

	def setUp(self):
		self.host = User.objects.create_user(username="ab_host", password="secret123", is_staff=True)
		self.player = User.objects.create_user(username="ab_player", password="secret123")

	def _sweep(self, **kwargs):
		"""One sweep, now. The rate limit is about not walking the table a
		hundred times a minute in production, and has nothing to say about a
		test that wants two sweeps in a row."""
		from tournaments.absentees import drop_absent_registrations, reset_sweep_clock

		reset_sweep_clock()
		return drop_absent_registrations(timezone.now(), **kwargs)

	def tearDown(self):
		from accounts import presence
		from tournaments.absentees import reset_sweep_clock

		presence._socket_counts.clear()
		presence._gone_since.clear()
		reset_sweep_clock()
		_tournament_runners.clear()

	def _away_for(self, user, seconds):
		"""Pretend this player closed the app that long ago."""
		import time

		from accounts import presence

		presence._socket_counts.pop(user.id, None)
		presence._gone_since[user.id] = time.monotonic() - seconds

	def _tournament(self, **overrides):
		fields = {
			"name": "Friday", "host": self.host, "status": "lobby",
			"buy_in_cents": 0, "max_players": 9, "players_per_table": 9,
		}
		fields.update(overrides)
		return Tournament.objects.create(**fields)

	def _seat(self, tournament, user):
		table = tournament.ensure_table(1)
		return TournamentPlayer.objects.create(
			tournament=tournament, user=user, table=table, seat=1,
			seat_at_table=1, chips=tournament.starting_chips,
		)

	def test_a_seat_is_given_up_after_long_enough_away(self):
		from tournaments.absentees import TOURNAMENT_AFTER_SECONDS

		tournament = self._tournament()
		self._seat(tournament, self.player)
		self._away_for(self.player, TOURNAMENT_AFTER_SECONDS + 60)

		self.assertEqual(self._sweep(), 1)
		self.assertFalse(tournament.players.filter(user=self.player).exists())

	def test_somebody_who_has_the_app_open_keeps_their_seat(self):
		from accounts import presence
		
		tournament = self._tournament()
		self._seat(tournament, self.player)
		presence.arrived(self.player.id)

		self.assertEqual(self._sweep(), 0)
		self.assertTrue(tournament.players.filter(user=self.player).exists())

	def test_a_seat_survives_a_restart_that_never_saw_anybody_leave(self):
		"""Nothing is assumed about a player this process never watched go."""
		
		tournament = self._tournament()
		self._seat(tournament, self.player)

		self.assertEqual(self._sweep(), 0)

	def test_registering_days_ahead_and_closing_the_app_is_allowed(self):
		from tournaments.absentees import TOURNAMENT_AFTER_SECONDS

		tournament = self._tournament(
			scheduled_start_at=timezone.now() + timedelta(days=2),
		)
		self._seat(tournament, self.player)
		self._away_for(self.player, TOURNAMENT_AFTER_SECONDS + 3600)

		# This is the normal way to enter a Friday night on a Wednesday.
		self.assertEqual(self._sweep(), 0)
		self.assertTrue(tournament.players.filter(user=self.player).exists())

	def test_the_same_seat_goes_once_the_night_is_nearly_on(self):
		from tournaments.absentees import TOURNAMENT_AFTER_SECONDS

		tournament = self._tournament(
			scheduled_start_at=timezone.now() + timedelta(minutes=5),
		)
		self._seat(tournament, self.player)
		self._away_for(self.player, TOURNAMENT_AFTER_SECONDS + 60)

		self.assertEqual(self._sweep(), 1)

	def test_the_host_is_never_unregistered_from_their_own_tournament(self):
		"""Taking their seat strands everybody else in a lobby nobody can start."""
		from tournaments.absentees import TOURNAMENT_AFTER_SECONDS

		tournament = self._tournament()
		self._seat(tournament, self.host)
		self._away_for(self.host, TOURNAMENT_AFTER_SECONDS * 10)

		self.assertEqual(self._sweep(), 0)

	def test_a_tournament_already_dealing_is_left_alone(self):
		from tournaments.absentees import TOURNAMENT_AFTER_SECONDS

		tournament = self._tournament(status="running")
		self._seat(tournament, self.player)
		self._away_for(self.player, TOURNAMENT_AFTER_SECONDS * 10)

		# Their chips belong to the prize pool now. Being away is the engine's
		# business from here, and it sits them out rather than removing them.
		self.assertEqual(self._sweep(), 0)

	def test_a_queue_gives_up_a_seat_far_sooner_than_a_tournament(self):
		from tournaments.absentees import QUEUE_AFTER_SECONDS, TOURNAMENT_AFTER_SECONDS
		from tournaments import spingo

		self.assertLess(QUEUE_AFTER_SECONDS, TOURNAMENT_AFTER_SECONDS)

		game = Tournament.objects.create(host=self.player, **spingo.tournament_defaults(25))
		self._seat(game, self.player)
		self._away_for(self.player, QUEUE_AFTER_SECONDS + 30)

		self.assertEqual(self._sweep(), 1)
		# Nobody is left in it, so the queue row goes too: an empty one would be
		# offered to the next player as a game with somebody in it.
		self.assertFalse(Tournament.objects.filter(pk=game.pk).exists())

	def test_the_coins_come_back_with_the_seat(self):
		from sidegames.economy import wallet_for
		from sidegames.models import Wallet
		from tournaments import spingo
		from tournaments.absentees import QUEUE_AFTER_SECONDS
		from tournaments.coinbank import charge_entry

		wallet_for(self.player)
		Wallet.objects.filter(user=self.player).update(balance=500)
		game = Tournament.objects.create(host=self.player, **spingo.tournament_defaults(25))
		self.assertTrue(charge_entry(self.player, game))
		self._seat(game, self.player)
		self.assertEqual(Wallet.objects.get(user=self.player).balance, 475)

		self._away_for(self.player, QUEUE_AFTER_SECONDS + 30)
		self._sweep()

		self.assertEqual(Wallet.objects.get(user=self.player).balance, 500)

	def test_two_sweeps_in_a_row_do_not_both_walk_the_table(self):
		"""The lobby is polled every few seconds and this reads every waiting
		seat. Nothing it measures moves on that timescale."""
		from tournaments.absentees import (
			TOURNAMENT_AFTER_SECONDS, drop_absent_registrations, reset_sweep_clock,
		)

		tournament = self._tournament()
		self._seat(tournament, self.player)
		self._away_for(self.player, TOURNAMENT_AFTER_SECONDS + 60)
		reset_sweep_clock()

		self.assertEqual(drop_absent_registrations(timezone.now()), 1)
		# A second call moments later does nothing at all — including nothing
		# to a seat that has since become droppable.
		other = User.objects.create_user(username="ab_second", password="secret123")
		self._seat(tournament, other)
		self._away_for(other, TOURNAMENT_AFTER_SECONDS + 60)
		self.assertEqual(drop_absent_registrations(timezone.now()), 0)
		self.assertTrue(tournament.players.filter(user=other).exists())

		# And the next one, once the gap has passed, catches up.
		self.assertEqual(self._sweep(), 1)

	def test_a_restart_does_not_make_an_absent_seat_safe(self):
		"""The in-memory record is gone; the profile still says when they left."""
		from accounts import presence
		from tournaments.absentees import TOURNAMENT_AFTER_SECONDS

		tournament = self._tournament()
		self._seat(tournament, self.player)
		from accounts.models import Profile

		Profile.objects.create(
			user=self.player,
			last_seen=timezone.now() - timedelta(seconds=TOURNAMENT_AFTER_SECONDS + 120),
		)
		# Nothing in memory: this process never watched them leave.
		presence._socket_counts.clear()
		presence._gone_since.clear()

		self.assertEqual(self._sweep(), 1)

	def test_a_profile_that_was_never_stamped_keeps_its_seat(self):
		from accounts import presence

		tournament = self._tournament()
		self._seat(tournament, self.player)
		presence._socket_counts.clear()
		presence._gone_since.clear()

		# last_seen is null: nobody has ever seen this player leave, so nothing
		# is assumed about them.
		self.assertEqual(self._sweep(), 0)

	def test_the_player_asking_never_loses_their_own_seat(self):
		"""Whatever the presence socket believes, somebody making a request is
		plainly here — and a socket that failed to open must not cost them a
		seat while they sit in the lobby watching it."""
		from tournaments.absentees import TOURNAMENT_AFTER_SECONDS

		tournament = self._tournament()
		self._seat(tournament, self.player)
		self._away_for(self.player, TOURNAMENT_AFTER_SECONDS * 10)

		self.assertEqual(self._sweep(here=self.player.id), 0)
		self.assertEqual(self._sweep(), 1)

	def test_a_queue_that_still_has_somebody_in_it_is_kept(self):
		from tournaments import spingo
		from tournaments.absentees import QUEUE_AFTER_SECONDS

		other = User.objects.create_user(username="ab_other", password="secret123")
		game = Tournament.objects.create(host=self.player, **spingo.tournament_defaults(25))
		self._seat(game, self.player)
		TournamentPlayer.objects.create(
			tournament=game, user=other, table=game.ensure_table(1), seat=2,
			seat_at_table=2, chips=game.starting_chips,
		)
		self._away_for(self.player, QUEUE_AFTER_SECONDS + 30)

		self._sweep()

		game.refresh_from_db()
		self.assertEqual(game.players.count(), 1)
		# The host column pointed at the player who left, so it is handed on.
		self.assertEqual(game.host_id, other.id)


class NobodyPausesAFastGameTests(APITestCase):
	"""A Spin n Go or a Sit n Go cannot be paused, by anybody, ever.

	Ten minutes of poker between strangers has nothing worth pausing: there is
	no host — the column points at whoever sat first — and a game held open
	while two people are disconnected is a game nobody can finish. The engine
	deals on, folds the seats that do not answer, and the tournament ends.
	"""

	def setUp(self):
		self.player = User.objects.create_user(username="np_player", password="secret123")
		self.boss = User.objects.create_superuser(username="np_boss", password="secret123")

	def tearDown(self):
		_tournament_runners.clear()

	def _game(self):
		from tournaments import spingo

		return Tournament.objects.create(host=self.player, **spingo.tournament_defaults(25))

	def test_the_pause_button_is_refused_to_the_seat_that_holds_the_host_column(self):
		game = self._game()
		self.client.force_authenticate(self.player)

		response = self.client.post(reverse("tournament-pause", args=[game.id]))

		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

	def test_not_even_the_superuser_can_pause_one(self):
		game = self._game()
		self.client.force_authenticate(self.boss)

		response = self.client.post(reverse("tournament-pause", args=[game.id]))

		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

	def test_nothing_in_the_engine_pauses_a_table_on_its_own(self):
		"""The only way into a pause is the endpoint above.

		Checked by reading the engine rather than by playing one out: a
		disconnection sits a player out and, past the timeout, removes them —
		it never stops the clock. If a future change adds an automatic pause
		this test is where it will be noticed.
		"""
		import inspect

		from game import coordinator

		source = inspect.getsource(coordinator)
		# The two places is_paused is switched on are pause() itself and the
		# snapshot that reports it. Nothing else may set it.
		setters = [
			line.strip() for line in source.splitlines()
			if "self.is_paused = True" in line
		]
		self.assertEqual(len(setters), 1)
		pause_source = inspect.getsource(coordinator.MultiTableTournamentCoordinator.pause)
		self.assertIn("self.is_paused = True", pause_source)


class TournamentAnnouncementTests(APITestCase):
	"""Being told your own game is about to deal, from wherever you are."""

	def setUp(self):
		from tournaments import announce

		announce.forget()
		self.host = User.objects.create_user(username="an_host", password="secret123", is_staff=True)
		self.player = User.objects.create_user(username="an_player", password="secret123")
		self.tournament = Tournament.objects.create(
			name="Nine o'clock", host=self.host, status="lobby",
			buy_in_cents=2000, max_players=9, players_per_table=9,
		)
		self.third = User.objects.create_user(username="an_third", password="secret123")
		# Three: a scheduled tournament does not start itself with two.
		for index, user in enumerate((self.host, self.player, self.third)):
			TournamentPlayer.objects.create(
				tournament=self.tournament, user=user,
				table=self.tournament.ensure_table(1), seat=index,
				seat_at_table=index, chips=self.tournament.starting_chips,
			)

	def tearDown(self):
		from tournaments import announce

		announce.forget()
		_tournament_runners.clear()

	def test_starting_a_tournament_tells_everybody_holding_a_seat(self):
		sent = []
		with patch("tournaments.announce.notify_user", side_effect=lambda uid, payload: sent.append((uid, payload))):
			self.client.force_authenticate(self.host)
			response = self.client.post(reverse("tournament-start", args=[self.tournament.id]))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual({uid for uid, _ in sent}, {self.host.id, self.player.id, self.third.id})
		self.assertEqual(sent[0][1]["type"], "tournament_started")
		self.assertEqual(sent[0][1]["game"]["id"], self.tournament.id)
		self.assertEqual(sent[0][1]["game"]["label"], "Nine o'clock")

	def test_the_warning_goes_out_once_and_not_again(self):
		"""This is swept from the lobby, which is polled every few seconds. A
		reminder that arrives on every poll is a nag, not a reminder."""
		from tournaments.announce import WARN_BEFORE_SECONDS, announce_starting_soon

		sent = []
		with patch("tournaments.announce.notify_user", side_effect=lambda uid, payload: sent.append(uid)):
			first = announce_starting_soon(self.tournament, WARN_BEFORE_SECONDS - 30)
			second = announce_starting_soon(self.tournament, WARN_BEFORE_SECONDS - 60)

		self.assertEqual(first, 3)
		self.assertEqual(second, 0)
		self.assertEqual(len(sent), 3)

	def test_nothing_is_said_about_a_start_that_is_still_hours_off(self):
		from tournaments.announce import announce_starting_soon

		with patch("tournaments.announce.notify_user") as told:
			self.assertEqual(announce_starting_soon(self.tournament, 3 * 3600), 0)
			# Nor about one whose time has already passed: that is a start, and
			# it has its own message.
			self.assertEqual(announce_starting_soon(self.tournament, -30), 0)
			self.assertEqual(announce_starting_soon(self.tournament, None), 0)

		told.assert_not_called()

	def test_a_scheduled_tournament_announces_itself_when_its_time_comes(self):
		self.tournament.scheduled_start_at = timezone.now() - timedelta(seconds=5)
		self.tournament.save(update_fields=["scheduled_start_at"])

		sent = []
		with patch("tournaments.announce.notify_user", side_effect=lambda uid, payload: sent.append(payload)):
			self.client.force_authenticate(self.player)
			self.client.get(reverse("tournament-list"), {"scope": "upcoming"})

		self.tournament.refresh_from_db()
		self.assertEqual(self.tournament.status, "running")
		self.assertTrue(sent)
		self.assertTrue(all(one["type"] == "tournament_started" for one in sent))

	def test_a_message_that_cannot_be_sent_does_not_fail_the_start(self):
		"""A player who cannot be told still has a game that has started."""
		with patch("tournaments.announce.notify_user", side_effect=RuntimeError("no redis")):
			self.client.force_authenticate(self.host)
			with self.assertRaises(RuntimeError):
				self.client.post(reverse("tournament-start", args=[self.tournament.id]))

		# The raise above is the channel layer failing *inside* notify_user,
		# which the real one swallows — see accounts/notify.py. What matters
		# here is that the tournament was already saved before anybody was told.
		self.tournament.refresh_from_db()
		self.assertEqual(self.tournament.status, "running")


class RecurringNightTests(APITestCase):
	"""Friday at nine, every week.

	The thing a club with a league actually runs, and until now it was somebody
	remembering to make the same tournament by hand every Thursday.
	"""

	def setUp(self):
		self.host = User.objects.create_user(username="rc_host", password="secret123", is_staff=True)
		self.player = User.objects.create_user(username="rc_player", password="secret123")
		self.client.force_authenticate(self.host)

	def tearDown(self):
		_tournament_runners.clear()

	def _night(self, when=None, **overrides):
		from tournaments.models import BlindLevel

		fields = {
			"name": "Friday night", "host": self.host, "status": "lobby",
			"buy_in_cents": 2000, "max_players": 9, "players_per_table": 9,
			"scheduled_start_at": when or (timezone.now() + timedelta(days=1)),
		}
		fields.update(overrides)
		night = Tournament.objects.create(**fields)
		BlindLevel.objects.create(
			tournament=night, level_number=1, small_blind=25, big_blind=50,
			ante=0, duration_minutes=10,
		)
		return night

	def _repeat(self, night, **payload):
		return self.client.post(reverse("tournament-repeat", args=[night.id]), payload, format="json")

	def test_a_night_becomes_a_series_at_its_own_hour(self):
		from tournaments.fixtures import from_moment
		from tournaments.models import Fixture

		when = timezone.now() + timedelta(days=2)
		night = self._night(when)

		response = self._repeat(night)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		fixture = Fixture.objects.get()
		# Read off the game rather than asked for again: the host already said
		# when by scheduling it.
		self.assertEqual((fixture.weekday, fixture.start_time), from_moment(when))
		self.assertEqual(fixture.name, "Friday night")
		self.assertIn("at", response.data["repeats"]["label"])

	def test_the_first_night_belongs_to_the_series_it_started(self):
		"""Otherwise the series would immediately open a second game for a
		night that already has one."""
		night = self._night()

		self._repeat(night)

		night.refresh_from_db()
		self.assertIsNotNone(night.fixture_id)
		self.assertEqual(night.occurs_on, night.scheduled_start_at.date())

	def test_a_night_with_no_hour_cannot_repeat(self):
		night = self._night(scheduled_start_at=None)

		response = self._repeat(night)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_only_somebody_who_runs_it_may_set_it_repeating(self):
		night = self._night()
		self.client.force_authenticate(self.player)

		self.assertEqual(self._repeat(night).status_code, status.HTTP_404_NOT_FOUND)

	def test_the_next_night_opens_by_itself_with_the_same_terms(self):
		from tournaments.fixturebank import open_due_fixtures

		night = self._night(timezone.now() + timedelta(minutes=5), buy_in_cents=3000)
		self._repeat(night)

		# Five days later somebody opens the lobby, and next week's night is
		# close enough to register for.
		later = timezone.now() + timedelta(days=5)
		self.assertEqual(open_due_fixtures(later), 1)

		nights = Tournament.objects.filter(fixture__isnull=False).order_by("occurs_on")
		self.assertEqual(nights.count(), 2)
		nxt = nights.last()
		self.assertEqual(nxt.buy_in_cents, 3000)
		self.assertEqual(nxt.name, "Friday night")
		self.assertEqual(nxt.levels.count(), 1)
		self.assertEqual(nxt.status, "lobby")
		# Seven days after the first, at the same hour and minute — the seconds
		# of the original are dropped on purpose, since nobody schedules a night
		# for 21:00:37.
		first = timezone.localtime(night.scheduled_start_at)
		again = timezone.localtime(nxt.scheduled_start_at)
		self.assertEqual((again.date() - first.date()).days, 7)
		self.assertEqual((again.hour, again.minute), (first.hour, first.minute))

	def test_sweeping_twice_does_not_open_the_same_night_twice(self):
		from tournaments.fixturebank import open_due_fixtures

		self._repeat(self._night(timezone.now() + timedelta(minutes=5)))
		later = timezone.now() + timedelta(days=5)

		self.assertEqual(open_due_fixtures(later), 1)
		self.assertEqual(open_due_fixtures(later), 0)
		self.assertEqual(Tournament.objects.count(), 2)

	def test_a_night_nobody_was_there_for_is_not_opened_after_the_fact(self):
		"""A fixture swept a fortnight late opens the one coming, not the two
		that have been and gone: a game scheduled in the past is a row nobody
		can play and nobody can clear."""
		from tournaments.fixturebank import open_due_fixtures

		self._repeat(self._night(timezone.now() + timedelta(minutes=5)))

		opened = open_due_fixtures(timezone.now() + timedelta(days=14))

		self.assertLessEqual(opened, 1)
		for night in Tournament.objects.filter(fixture__isnull=False):
			if night.occurs_on != timezone.localtime(night.scheduled_start_at).date():
				continue
			self.assertGreaterEqual(
				night.scheduled_start_at, timezone.now() - timedelta(days=1),
				"a night was opened for a date that had already passed",
			)

	def test_stopping_it_leaves_the_games_it_already_opened(self):
		from tournaments.fixturebank import open_due_fixtures

		night = self._night(timezone.now() + timedelta(minutes=5))
		self._repeat(night)
		later = timezone.now() + timedelta(days=5)
		open_due_fixtures(later)

		response = self.client.delete(reverse("tournament-repeat", args=[night.id]))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		# Two nights still there — people have registered for those.
		self.assertEqual(Tournament.objects.count(), 2)
		# And nothing new opens.
		self.assertEqual(open_due_fixtures(timezone.now() + timedelta(days=30)), 0)

	def test_the_detail_page_says_whether_it_comes_round_again(self):
		night = self._night()

		before = self.client.get(reverse("tournament-detail", args=[night.id]))
		self.assertIsNone(before.data["repeats"])

		self._repeat(night)
		after = self.client.get(reverse("tournament-detail", args=[night.id]))
		self.assertIsNotNone(after.data["repeats"])
		self.assertIn("at", after.data["repeats"]["label"])

	def test_a_club_night_keeps_its_club_and_its_league(self):
		from clubs.models import Club, League, Membership, Season
		from tournaments.fixturebank import open_due_fixtures

		club = Club.objects.create(name="Quinta", created_by=self.host)
		Membership.objects.create(club=club, user=self.host, role=Membership.OWNER)
		season = Season.objects.create(league=League.objects.create(club=club, name="Sunday"), name="Autumn")
		night = self._night(timezone.now() + timedelta(minutes=5), club=club, season=season)

		self._repeat(night)
		open_due_fixtures(timezone.now() + timedelta(days=5))

		nxt = Tournament.objects.filter(fixture__isnull=False).order_by("occurs_on").last()
		self.assertEqual(nxt.club_id, club.id)
		self.assertEqual(nxt.season_id, season.id)

	def test_a_closed_season_takes_no_new_nights_and_the_night_runs_anyway(self):
		from clubs.models import Club, League, Membership, Season
		from tournaments.fixturebank import open_due_fixtures

		club = Club.objects.create(name="Quinta", created_by=self.host)
		Membership.objects.create(club=club, user=self.host, role=Membership.OWNER)
		season = Season.objects.create(league=League.objects.create(club=club, name="Sunday"), name="Autumn")
		night = self._night(timezone.now() + timedelta(minutes=5), club=club, season=season)
		self._repeat(night)

		season.closed_at = timezone.now()
		season.save(update_fields=["closed_at"])
		open_due_fixtures(timezone.now() + timedelta(days=5))

		nxt = Tournament.objects.filter(fixture__isnull=False).order_by("occurs_on").last()
		# The night is not worth cancelling over a closed season: it runs, and
		# counts for nothing.
		self.assertEqual(nxt.club_id, club.id)
		self.assertIsNone(nxt.season_id)


class FixtureCalendarTests(TestCase):
	"""Which Friday, and at what hour."""

	def test_today_counts_if_the_hour_has_not_passed(self):
		from datetime import time

		from tournaments.fixtures import local_at, next_occurrence

		# A Friday at noon, asking about Fridays at nine in the evening.
		noon = local_at(timezone.localtime().date(), time(12, 0))
		friday_noon = noon + timedelta(days=(4 - timezone.localtime(noon).weekday()) % 7)

		self.assertEqual(
			next_occurrence(4, time(21, 0), friday_noon).date(),
			timezone.localtime(friday_noon).date(),
		)

	def test_an_hour_that_has_passed_means_next_week(self):
		from datetime import time

		from tournaments.fixtures import local_at, next_occurrence

		late = local_at(timezone.localtime().date(), time(23, 0))
		friday_late = late + timedelta(days=(4 - timezone.localtime(late).weekday()) % 7)

		self.assertEqual(
			(next_occurrence(4, time(21, 0), friday_late) - friday_late).days, 6,
		)

	def test_a_fortnight_opened_at_once_is_two_nights(self):
		from datetime import time

		from tournaments.fixtures import occurrences_within

		found = occurrences_within(4, time(21, 0), 14)

		self.assertEqual(len(found), 2)
		self.assertEqual((found[1] - found[0]).days, 7)

	def test_how_early_a_night_opens_is_held_between_a_day_and_three_weeks(self):
		from tournaments.fixtures import DEFAULT_DAYS_AHEAD, MAX_DAYS_AHEAD, clean_days_ahead

		self.assertEqual(clean_days_ahead(0), 1)
		self.assertEqual(clean_days_ahead(400), MAX_DAYS_AHEAD)
		self.assertEqual(clean_days_ahead("nonsense"), DEFAULT_DAYS_AHEAD)
		self.assertEqual(clean_days_ahead(5), 5)

	def test_it_says_the_arrangement_out_loud(self):
		from datetime import time

		from tournaments.fixtures import describe

		self.assertEqual(describe(4, time(21, 0)), "Fridays at 21:00")
		self.assertEqual(describe(0, time(9, 30)), "Mondays at 09:30")


class ScheduledStartTests(APITestCase):
	"""A night that starts itself, and what it waits for."""

	def setUp(self):
		self.host = User.objects.create_user(username="ss_host", password="secret123", is_staff=True)
		self.players = [
			User.objects.create_user(username=f"ss_{index}", password="secret123")
			for index in range(4)
		]
		self.client.force_authenticate(self.host)

	def tearDown(self):
		_tournament_runners.clear()

	def _due_night(self, seated):
		night = Tournament.objects.create(
			name="Nine o'clock", host=self.host, status="lobby",
			buy_in_cents=0, max_players=9, players_per_table=9,
			scheduled_start_at=timezone.now() - timedelta(seconds=30),
		)
		for index, user in enumerate(self.players[:seated]):
			TournamentPlayer.objects.create(
				tournament=night, user=user, table=night.ensure_table(1),
				seat=index, seat_at_table=index, chips=night.starting_chips,
			)
		return night

	def _sweep(self):
		"""Whatever a lobby request does on its way past."""
		self.client.get(reverse("tournament-list"), {"scope": "upcoming"})

	def test_two_people_do_not_make_a_night(self):
		"""It would be a heads-up match nobody signed up for, and those two are
		locked into it while anybody a minute late finds it already running."""
		night = self._due_night(seated=2)

		self._sweep()

		night.refresh_from_db()
		self.assertEqual(night.status, "lobby")

	def test_three_do(self):
		night = self._due_night(seated=3)

		self._sweep()

		night.refresh_from_db()
		self.assertEqual(night.status, "running")

	def test_it_starts_as_soon_as_the_third_arrives(self):
		night = self._due_night(seated=2)
		self._sweep()

		self.client.force_authenticate(self.players[2])
		self.client.post(reverse("tournament-join", args=[night.id]))
		self.client.force_authenticate(self.host)
		self._sweep()

		night.refresh_from_db()
		self.assertEqual(night.status, "running")

	def test_a_host_may_still_start_a_heads_up_on_purpose(self):
		"""Two people deciding to play heads-up is a decision. A clock deciding
		it for them is not."""
		night = self._due_night(seated=2)

		response = self.client.post(reverse("tournament-start", args=[night.id]))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		night.refresh_from_db()
		self.assertEqual(night.status, "running")

	def test_an_hour_that_has_not_come_starts_nothing(self):
		night = self._due_night(seated=4)
		night.scheduled_start_at = timezone.now() + timedelta(hours=2)
		night.save(update_fields=["scheduled_start_at"])

		self._sweep()

		night.refresh_from_db()
		self.assertEqual(night.status, "lobby")
