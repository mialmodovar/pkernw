from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from datetime import timedelta
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Tournament


User = get_user_model()


class TournamentCreationTests(APITestCase):
	def setUp(self):
		self.user = User.objects.create_user(username="host", password="secret123")
		self.client.force_authenticate(self.user)

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
		self.assertEqual(tournament.players.count(), 1)
		self.assertEqual(tournament.tables.count(), 1)
		self.assertEqual(tournament.levels.count(), 3)
		host_seat = tournament.players.get(user=self.user)
		self.assertEqual(host_seat.table.table_number, 1)
		self.assertEqual(host_seat.seat_at_table, 0)
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
