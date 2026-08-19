from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from tournaments.models import Tournament, TournamentPlayer

from .models import Club, League, Membership, Season
from .scoring import PRESETS, normalize_scheme, points_for, standings

User = get_user_model()


class ScoringTests(TestCase):
	"""What a night is worth. No database, no tournament — just the rules."""

	def test_the_table_pays_down_the_places_and_then_a_flat_rate(self):
		scheme = PRESETS["placement_only"]

		self.assertEqual(points_for({"finish_position": 1}, scheme), 10)
		self.assertEqual(points_for({"finish_position": 3}, scheme), 5)
		# Past the listed places everybody gets the same for turning up and
		# outlasting nobody in particular.
		self.assertEqual(points_for({"finish_position": 9}, scheme), 1)

	def test_knockouts_and_attendance_add_to_the_placement(self):
		scheme = PRESETS["placement_ko"]

		# 2nd (7) + attendance (1) + three knockouts (6).
		self.assertEqual(points_for({"finish_position": 2, "knockouts": 3}, scheme), 14)

	def test_a_night_nobody_finished_scores_nothing(self):
		"""No finish position means the tournament never ended, or they are
		still in it — not that they came last."""
		scheme = PRESETS["placement_ko"]

		self.assertEqual(points_for({"finish_position": None, "knockouts": 4}, scheme), 0)
		self.assertEqual(points_for({}, scheme), 0)
		self.assertEqual(points_for(None, scheme), 0)

	def test_a_scheme_nobody_recognises_falls_back_rather_than_breaking(self):
		"""A table people are looking at must not be crashable by a stored row
		from an older version, or by somebody editing JSON by hand."""
		scheme = normalize_scheme({"preset": "nonsense"})

		self.assertEqual(scheme["preset"], "custom")
		self.assertGreater(points_for({"finish_position": 1}, scheme), 0)
		self.assertEqual(points_for({"finish_position": 1}, {"placement": "not a list"}),
						 points_for({"finish_position": 1}, PRESETS["placement_ko"]))

	def test_numbers_that_do_not_match_the_preset_make_it_custom(self):
		scheme = normalize_scheme({"preset": "placement_ko", "per_knockout": 5})

		self.assertEqual(scheme["preset"], "custom")
		self.assertEqual(scheme["per_knockout"], 5)

	def test_untouched_preset_numbers_keep_the_preset_name(self):
		scheme = normalize_scheme(dict(PRESETS["placement_only"]))

		self.assertEqual(scheme["preset"], "placement_only")

	def test_nonsense_numbers_never_score_negative(self):
		scheme = normalize_scheme({"placement": [-5, "x", None], "per_knockout": -3})

		self.assertGreaterEqual(points_for({"finish_position": 1, "knockouts": 2}, scheme), 0)


class StandingsTests(TestCase):
	"""The table, built from results rather than kept beside them."""

	def setUp(self):
		self.owner = User.objects.create_user(username="s_owner", password="secret123")
		self.rival = User.objects.create_user(username="s_rival", password="secret123")
		self.club = Club.objects.create(name="Quinta", created_by=self.owner)
		self.league = League.objects.create(club=self.club, name="Sunday")
		self.season = Season.objects.create(league=self.league, name="Autumn")

	def _night(self, status_value="finished", season=None, **finishes):
		tournament = Tournament.objects.create(
			host=self.owner, name="Night", status=status_value,
			club=self.club, season=self.season if season is None else season,
			payout_structure=[{"place": 1, "label": "1st", "percentage": 100}],
		)
		for seat, (user, spec) in enumerate(finishes.items()):
			TournamentPlayer.objects.create(
				tournament=tournament, user=getattr(self, user), seat=seat, chips=0,
				finish_position=spec[0], knockouts=spec[1],
			)
		return tournament

	def test_a_finished_night_lands_on_the_table(self):
		self._night(owner=(1, 2), rival=(2, 0))

		rows = standings(self.season)

		self.assertEqual([row["username"] for row in rows], ["s_owner", "s_rival"])
		self.assertEqual(rows[0]["wins"], 1)
		self.assertEqual(rows[0]["knockouts"], 2)
		self.assertEqual(rows[0]["cashes"], 1)

	def test_a_night_still_being_played_counts_for_nothing_yet(self):
		self._night(status_value="running", owner=(1, 3), rival=(2, 0))

		self.assertEqual(standings(self.season), [])

	def test_a_club_night_outside_any_league_moves_no_table(self):
		"""The fun format nobody wants distorting the standings."""
		tournament = Tournament.objects.create(
			host=self.owner, name="Just for fun", status="finished", club=self.club, season=None,
		)
		TournamentPlayer.objects.create(
			tournament=tournament, user=self.owner, seat=0, chips=0, finish_position=1, knockouts=5,
		)

		self.assertEqual(standings(self.season), [])

	def test_two_leagues_in_one_club_keep_separate_tables(self):
		other = League.objects.create(club=self.club, name="Turbo")
		other_season = Season.objects.create(league=other, name="Autumn")
		self._night(owner=(1, 0), rival=(2, 0))
		self._night(season=other_season, rival=(1, 0))

		sunday = standings(self.season)
		turbo = standings(other_season)

		self.assertEqual(sunday[0]["username"], "s_owner")
		self.assertEqual([row["username"] for row in turbo], ["s_rival"])
		self.assertEqual(turbo[0]["played"], 1)

	def test_a_tie_on_points_breaks_on_who_actually_won_nights(self):
		# Level on points, but one of them keeps winning.
		self._night(owner=(1, 0), rival=(5, 4))

		rows = standings(self.season)

		self.assertEqual(rows[0]["points"], rows[1]["points"])
		self.assertEqual(rows[0]["username"], "s_owner")

	def test_the_table_follows_the_seasons_own_scoring(self):
		self._night(owner=(1, 3), rival=(2, 0))
		before = standings(self.season)[0]["points"]

		self.season.scoring = dict(PRESETS["placement_only"])
		self.season.save(update_fields=["scoring"])

		# Same results, different rules, and nothing was recomputed or stored.
		self.assertLess(standings(self.season)[0]["points"], before)


class MembershipTests(APITestCase):
	def setUp(self):
		self.owner = User.objects.create_user(username="m_owner", password="secret123")
		self.joiner = User.objects.create_user(username="m_joiner", password="secret123")
		self.client.force_authenticate(self.owner)

	def _club(self, **overrides):
		response = self.client.post(reverse("clubs"), {"name": "Quinta Poker", **overrides}, format="json")
		return Club.objects.get(id=response.data["id"])

	def test_making_a_club_makes_you_its_owner(self):
		club = self._club()

		self.assertEqual(club.memberships.get(user=self.owner).role, Membership.OWNER)

	def test_anybody_can_join_a_public_club(self):
		club = self._club()
		self.client.force_authenticate(self.joiner)

		response = self.client.post(reverse("club-join", args=[club.slug]))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertTrue(club.memberships.filter(user=self.joiner).exists())

	def test_a_private_club_needs_its_code(self):
		club = self._club(is_public=False)
		self.client.force_authenticate(self.joiner)

		refused = self.client.post(reverse("club-join", args=[club.slug]))
		self.assertEqual(refused.status_code, status.HTTP_403_FORBIDDEN)

		joined = self.client.post(reverse("club-join-by-code"), {"code": club.invite_code}, format="json")
		self.assertEqual(joined.status_code, status.HTTP_200_OK)
		self.assertTrue(club.memberships.filter(user=self.joiner).exists())

	def test_a_wrong_code_is_refused(self):
		self._club(is_public=False)
		self.client.force_authenticate(self.joiner)

		response = self.client.post(reverse("club-join-by-code"), {"code": "NOPE99"}, format="json")

		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

	def test_a_private_club_is_not_listed_to_outsiders(self):
		self._club(is_public=False)
		self.client.force_authenticate(self.joiner)

		self.assertEqual(self.client.get(reverse("clubs")).data, [])

	def test_the_invite_code_is_not_handed_to_outsiders(self):
		"""A code visible to anybody would make every private club public."""
		club = self._club()
		self.client.force_authenticate(self.joiner)

		response = self.client.get(reverse("club-detail", args=[club.slug]))

		self.assertIsNone(response.data["invite_code"])

	def test_only_the_owner_can_make_somebody_staff(self):
		club = self._club()
		self.client.post(reverse("club-join", args=[club.slug]))
		Membership.objects.get_or_create(club=club, user=self.joiner)
		self.client.force_authenticate(self.joiner)

		response = self.client.patch(
			reverse("club-member", args=[club.slug, "m_owner"]), {"role": "member"}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_handing_over_leaves_exactly_one_owner(self):
		club = self._club()
		Membership.objects.create(club=club, user=self.joiner)

		self.client.patch(
			reverse("club-member", args=[club.slug, "m_joiner"]), {"role": "owner"}, format="json",
		)

		self.assertEqual(club.memberships.filter(role=Membership.OWNER).count(), 1)
		self.assertEqual(club.memberships.get(user=self.joiner).role, Membership.OWNER)
		self.assertEqual(club.memberships.get(user=self.owner).role, Membership.STAFF)

	def test_an_owner_cannot_walk_out_on_a_club_with_members_in_it(self):
		club = self._club()
		Membership.objects.create(club=club, user=self.joiner)

		response = self.client.delete(reverse("club-leave", args=[club.slug]))

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_the_last_person_out_can_leave(self):
		club = self._club()

		response = self.client.delete(reverse("club-leave", args=[club.slug]))

		self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)


class SeasonTests(APITestCase):
	def setUp(self):
		self.owner = User.objects.create_user(username="se_owner", password="secret123")
		self.member = User.objects.create_user(username="se_member", password="secret123")
		self.client.force_authenticate(self.owner)
		self.club = Club.objects.create(name="Quinta", created_by=self.owner)
		Membership.objects.create(club=self.club, user=self.owner, role=Membership.OWNER)
		Membership.objects.create(club=self.club, user=self.member, role=Membership.MEMBER)

	def _league(self):
		response = self.client.post(
			reverse("club-create-league", args=[self.club.slug]), {"name": "Sunday"}, format="json",
		)
		return League.objects.get(id=response.data["id"])

	def test_a_new_league_opens_with_a_season(self):
		"""A league with no season has nowhere to put a result."""
		league = self._league()

		self.assertIsNotNone(league.open_season)

	def test_a_member_cannot_start_a_league(self):
		self.client.force_authenticate(self.member)

		response = self.client.post(
			reverse("club-create-league", args=[self.club.slug]), {"name": "Mine"}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_the_next_season_carries_the_rules_forward(self):
		league = self._league()
		season = league.open_season
		self.client.patch(
			reverse("season-detail", args=[season.id]),
			{"scoring": {"preset": "placement_ko", "per_knockout": 4}}, format="json",
		)

		self.client.post(reverse("league-next-season", args=[league.id]), {"name": "Winter"}, format="json")

		season.refresh_from_db()
		self.assertIsNotNone(season.closed_at)
		self.assertEqual(league.open_season.name, "Winter")
		self.assertEqual(league.open_season.scoring["per_knockout"], 4)

	def test_a_closed_season_cannot_be_rescored(self):
		"""It is a record of what happened under the rules it was played under."""
		league = self._league()
		season = league.open_season
		self.client.post(reverse("league-next-season", args=[league.id]), {}, format="json")

		response = self.client.patch(
			reverse("season-detail", args=[season.id]),
			{"scoring": {"preset": "placement_only"}}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_standings_come_back_for_the_open_season_by_default(self):
		league = self._league()

		response = self.client.get(reverse("league-standings", args=[league.id]))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["season"]["id"], league.open_season.id)
		self.assertEqual(response.data["rows"], [])


class ClubTournamentPermissionTests(APITestCase):
	"""Communities run themselves: club staff open their own tournaments."""

	def setUp(self):
		self.organiser = User.objects.create_user(username="c_organiser", password="secret123")
		self.member = User.objects.create_user(username="c_member", password="secret123")
		self.outsider = User.objects.create_user(username="c_outsider", password="secret123")

		self.club = Club.objects.create(name="Quinta", created_by=self.organiser)
		Membership.objects.create(club=self.club, user=self.organiser, role=Membership.OWNER)
		Membership.objects.create(club=self.club, user=self.member, role=Membership.MEMBER)
		self.league = League.objects.create(club=self.club, name="Sunday")
		self.season = Season.objects.create(league=self.league, name="Autumn")

	def _create(self, user, **payload):
		self.client.force_authenticate(user)
		return self.client.post(
			reverse("tournament-list"), {"name": "Club night", **payload}, format="json",
		)

	def test_club_staff_can_open_a_tournament_without_being_site_staff(self):
		self.assertFalse(self.organiser.is_staff)

		response = self._create(self.organiser, club=self.club.id, season=self.season.id)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(Tournament.objects.get(id=response.data["id"]).season_id, self.season.id)

	def test_a_plain_member_cannot(self):
		response = self._create(self.member, club=self.club.id)

		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_somebody_in_no_club_at_all_still_cannot(self):
		response = self._create(self.outsider, club=self.club.id)

		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_a_season_from_another_club_is_refused(self):
		"""Otherwise a night could be dropped onto another community's table by
		anybody who knew a season id."""
		other_club = Club.objects.create(name="Elsewhere", created_by=self.organiser)
		Membership.objects.create(club=other_club, user=self.organiser, role=Membership.OWNER)
		other_league = League.objects.create(club=other_club, name="Theirs")
		other_season = Season.objects.create(league=other_league, name="Autumn")

		response = self._create(self.organiser, club=self.club.id, season=other_season.id)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_a_closed_season_takes_no_new_nights(self):
		from django.utils import timezone

		self.season.closed_at = timezone.now()
		self.season.save(update_fields=["closed_at"])

		response = self._create(self.organiser, club=self.club.id, season=self.season.id)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_a_club_night_can_count_for_nothing(self):
		response = self._create(self.organiser, club=self.club.id)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertIsNone(Tournament.objects.get(id=response.data["id"]).season_id)

	def test_club_staff_can_start_a_tournament_somebody_else_created(self):
		"""A co-organiser should be able to start the night when whoever made
		it is stuck in traffic."""
		colleague = User.objects.create_user(username="c_colleague", password="secret123")
		Membership.objects.create(club=self.club, user=colleague, role=Membership.STAFF)
		created = self._create(self.organiser, club=self.club.id).data
		tournament = Tournament.objects.get(id=created["id"])
		TournamentPlayer.objects.create(tournament=tournament, user=self.member, seat=1, chips=1000)

		self.client.force_authenticate(colleague)
		response = self.client.post(reverse("tournament-start", args=[tournament.id]))

		self.assertEqual(response.status_code, status.HTTP_200_OK)

	def test_a_member_cannot_start_the_clubs_tournament(self):
		created = self._create(self.organiser, club=self.club.id).data
		tournament = Tournament.objects.get(id=created["id"])

		self.client.force_authenticate(self.member)
		response = self.client.post(reverse("tournament-start", args=[tournament.id]))

		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

	def test_which_club_a_night_belongs_to_is_settled_when_it_is_made(self):
		created = self._create(self.organiser, club=self.club.id, season=self.season.id).data

		self.client.patch(
			reverse("tournament-edit", args=[created["id"]]), {"season": None}, format="json",
		)

		self.assertEqual(Tournament.objects.get(id=created["id"]).season_id, self.season.id)


class ClubRecordTests(APITestCase):
	"""What a club keeps: an all-time table, and the nights it has run."""

	def setUp(self):
		self.owner = User.objects.create_user(username="r_owner", password="secret123")
		self.rival = User.objects.create_user(username="r_rival", password="secret123")
		self.outsider = User.objects.create_user(username="r_outsider", password="secret123")
		self.client.force_authenticate(self.owner)

		self.club = Club.objects.create(name="Quinta", created_by=self.owner)
		Membership.objects.create(club=self.club, user=self.owner, role=Membership.OWNER)
		self.league = League.objects.create(club=self.club, name="Sunday")
		self.season = Season.objects.create(league=self.league, name="Autumn")

	def _night(self, name, season, status_value="finished", **finishes):
		tournament = Tournament.objects.create(
			host=self.owner, name=name, status=status_value, club=self.club, season=season,
		)
		for seat, (who, finish) in enumerate(finishes.items()):
			TournamentPlayer.objects.create(
				tournament=tournament, user=getattr(self, who), seat=seat, chips=0,
				finish_position=finish,
			)
		return tournament

	def test_the_leaderboard_adds_every_season_up(self):
		"""A season table says who is winning now; this says who is best here."""
		self._night("One", self.season, owner=1, rival=2)
		old = Season.objects.create(league=self.league, name="Summer")
		self._night("Two", old, rival=1, owner=2)
		self._night("Three", old, owner=1, rival=2)

		response = self.client.get(reverse("club-leaderboard", args=[self.club.slug]))

		rows = {row["username"]: row for row in response.data["rows"]}
		self.assertEqual(rows["r_owner"]["played"], 3)
		self.assertEqual(rows["r_owner"]["wins"], 2)
		self.assertEqual(rows["r_rival"]["wins"], 1)
		self.assertEqual(response.data["rows"][0]["username"], "r_owner")

	def test_the_leaderboard_counts_seasons_played(self):
		self._night("One", self.season, owner=1)
		old = Season.objects.create(league=self.league, name="Summer")
		self._night("Two", old, owner=1)

		response = self.client.get(reverse("club-leaderboard", args=[self.club.slug]))

		self.assertEqual(response.data["rows"][0]["seasons"], 2)

	def test_a_club_with_nothing_played_has_an_empty_table(self):
		response = self.client.get(reverse("club-leaderboard", args=[self.club.slug]))

		self.assertEqual(response.data["rows"], [])

	def test_the_history_lists_the_nights_newest_first(self):
		self._night("Older", self.season, owner=1)
		self._night("Newer", self.season, rival=1)

		response = self.client.get(reverse("club-tournaments", args=[self.club.slug]))

		self.assertEqual([row["name"] for row in response.data], ["Newer", "Older"])
		self.assertEqual(response.data[0]["winner"], "r_rival")
		self.assertEqual(response.data[0]["league_name"], "Sunday")

	def test_the_history_includes_a_night_still_to_come(self):
		"""The history and the diary are the same list read from both ends."""
		self._night("Tonight", None, status_value="lobby", owner=None)

		response = self.client.get(reverse("club-tournaments", args=[self.club.slug]))

		row = next(item for item in response.data if item["name"] == "Tonight")
		self.assertEqual(row["status"], "lobby")
		self.assertIsNone(row["winner"])
		self.assertIsNone(row["league_name"])

	def test_a_private_clubs_records_are_not_public(self):
		self.club.is_public = False
		self.club.save(update_fields=["is_public"])
		self.client.force_authenticate(self.outsider)

		self.assertEqual(
			self.client.get(reverse("club-leaderboard", args=[self.club.slug])).status_code,
			status.HTTP_404_NOT_FOUND,
		)
		self.assertEqual(
			self.client.get(reverse("club-tournaments", args=[self.club.slug])).status_code,
			status.HTTP_404_NOT_FOUND,
		)

	def test_anybody_can_read_a_public_clubs_records(self):
		self.client.force_authenticate(self.outsider)

		self.assertEqual(
			self.client.get(reverse("club-leaderboard", args=[self.club.slug])).status_code,
			status.HTTP_200_OK,
		)


class ClubManagementTests(APITestCase):
	"""Editing a club, staffing it, and closing it down."""

	def setUp(self):
		self.owner = User.objects.create_user(username="m_owner", password="x")
		self.helper = User.objects.create_user(username="m_helper", password="x")
		self.regular = User.objects.create_user(username="m_regular", password="x")
		self.boss = User.objects.create_superuser(username="m_boss", password="x")

		self.club = Club.objects.create(name="Quinta", slug="quinta", created_by=self.owner)
		Membership.objects.create(club=self.club, user=self.owner, role=Membership.OWNER)
		Membership.objects.create(club=self.club, user=self.helper, role=Membership.MEMBER)

	def _detail(self, user):
		self.client.force_authenticate(user)
		return self.client.get(reverse("club-detail", args=[self.club.slug])).data

	# --- what the page is allowed to draw

	def test_the_owner_is_told_they_may_edit_and_may_own(self):
		detail = self._detail(self.owner)

		self.assertEqual(detail["my_role"], "owner")
		self.assertTrue(detail["can_manage"])
		self.assertTrue(detail["can_own"])

	def test_a_plain_member_is_told_they_may_do_neither(self):
		detail = self._detail(self.helper)

		self.assertEqual(detail["my_role"], "member")
		self.assertFalse(detail["can_manage"])
		self.assertFalse(detail["can_own"])

	def test_the_superuser_may_do_everything_in_a_club_they_are_not_in(self):
		"""The permission functions have always said so; the page could not tell.

		can_manage is not derivable from a role, because the superuser has none.
		"""
		detail = self._detail(self.boss)

		self.assertIsNone(detail["my_role"])
		self.assertTrue(detail["can_manage"])
		self.assertTrue(detail["can_own"])
		# And the code, which they need to be able to read to hand it over.
		self.assertEqual(detail["invite_code"], self.club.invite_code)

	def test_somebody_outside_the_club_gets_no_code_and_no_controls(self):
		detail = self._detail(self.regular)

		self.assertIsNone(detail["invite_code"])
		self.assertFalse(detail["can_manage"])

	# --- editing

	def test_staff_can_rename_the_club_and_make_it_private(self):
		Membership.objects.filter(club=self.club, user=self.helper).update(role=Membership.STAFF)
		self.client.force_authenticate(self.helper)

		response = self.client.patch(
			reverse("club-detail", args=[self.club.slug]),
			{"name": "Quinta Poker", "description": "Thursdays", "is_public": False},
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.club.refresh_from_db()
		self.assertEqual(self.club.name, "Quinta Poker")
		self.assertFalse(self.club.is_public)
		# The slug is the address people have already bookmarked, so renaming
		# does not move the club.
		self.assertEqual(self.club.slug, "quinta")

	def test_a_member_cannot_edit_the_club(self):
		self.client.force_authenticate(self.helper)

		response = self.client.patch(
			reverse("club-detail", args=[self.club.slug]), {"name": "Mine now"}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
		self.club.refresh_from_db()
		self.assertEqual(self.club.name, "Quinta")

	def test_a_club_still_needs_a_name(self):
		self.client.force_authenticate(self.owner)

		response = self.client.patch(
			reverse("club-detail", args=[self.club.slug]), {"name": " "}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	# --- the invite code

	def test_staff_can_roll_the_invite_code(self):
		before = self.club.invite_code
		self.client.force_authenticate(self.owner)

		response = self.client.post(reverse("club-invite-code", args=[self.club.slug]))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.club.refresh_from_db()
		self.assertNotEqual(self.club.invite_code, before)
		self.assertEqual(response.data["invite_code"], self.club.invite_code)
		# Rolling it invites nobody out.
		self.assertEqual(self.club.memberships.count(), 2)

	def test_a_member_cannot_roll_the_invite_code(self):
		self.client.force_authenticate(self.helper)

		response = self.client.post(reverse("club-invite-code", args=[self.club.slug]))

		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	# --- staffing

	def test_the_owner_can_make_somebody_staff_and_take_it_back(self):
		self.client.force_authenticate(self.owner)
		url = reverse("club-member", args=[self.club.slug, "m_helper"])

		self.client.patch(url, {"role": "staff"}, format="json")
		self.assertEqual(
			Membership.objects.get(club=self.club, user=self.helper).role, "staff",
		)

		self.client.patch(url, {"role": "member"}, format="json")
		self.assertEqual(
			Membership.objects.get(club=self.club, user=self.helper).role, "member",
		)

	def test_staff_cannot_appoint_more_staff(self):
		Membership.objects.filter(club=self.club, user=self.helper).update(role=Membership.STAFF)
		self.client.force_authenticate(self.helper)

		response = self.client.patch(
			reverse("club-member", args=[self.club.slug, "m_owner"]),
			{"role": "member"}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_the_superuser_can_staff_a_club_they_are_not_in(self):
		self.client.force_authenticate(self.boss)

		response = self.client.patch(
			reverse("club-member", args=[self.club.slug, "m_helper"]),
			{"role": "staff"}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(
			Membership.objects.get(club=self.club, user=self.helper).role, "staff",
		)

	def test_handing_the_club_over_leaves_one_owner(self):
		self.client.force_authenticate(self.owner)

		self.client.patch(
			reverse("club-member", args=[self.club.slug, "m_helper"]),
			{"role": "owner"}, format="json",
		)

		roles = dict(self.club.memberships.values_list("user__username", "role"))
		self.assertEqual(roles["m_helper"], "owner")
		self.assertEqual(roles["m_owner"], "staff")

	# --- deleting

	def test_the_owner_can_delete_their_club_by_naming_it(self):
		league = League.objects.create(club=self.club, name="Sunday")
		Season.objects.create(league=league, name="S1")
		self.client.force_authenticate(self.owner)

		response = self.client.delete(
			reverse("club-detail", args=[self.club.slug]),
			{"confirm": self.club.slug}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
		self.assertFalse(Club.objects.filter(slug="quinta").exists())
		self.assertFalse(League.objects.filter(pk=league.pk).exists())

	def test_deleting_without_naming_the_club_does_nothing(self):
		self.client.force_authenticate(self.owner)

		response = self.client.delete(reverse("club-detail", args=[self.club.slug]), format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertTrue(Club.objects.filter(slug="quinta").exists())

	def test_staff_cannot_delete_the_club(self):
		Membership.objects.filter(club=self.club, user=self.helper).update(role=Membership.STAFF)
		self.client.force_authenticate(self.helper)

		response = self.client.delete(
			reverse("club-detail", args=[self.club.slug]),
			{"confirm": self.club.slug}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
		self.assertTrue(Club.objects.filter(slug="quinta").exists())

	def test_the_nights_the_club_ran_survive_it(self):
		"""Deleting a club must not delete what people played.

		The tournament's club is nulled rather than cascaded, so the night, its
		hands and its result are all still there — it simply stops belonging to
		a club.
		"""
		league = League.objects.create(club=self.club, name="Sunday")
		season = Season.objects.create(league=league, name="S1")
		night = Tournament.objects.create(
			host=self.owner, name="Thursday", club=self.club, season=season, status="finished",
		)
		self.client.force_authenticate(self.owner)

		self.client.delete(
			reverse("club-detail", args=[self.club.slug]),
			{"confirm": self.club.slug}, format="json",
		)

		night.refresh_from_db()
		self.assertIsNone(night.club_id)
		self.assertIsNone(night.season_id)

	# --- leagues

	def test_staff_can_rename_a_league_and_shelve_it(self):
		league = League.objects.create(club=self.club, name="Sunday")
		self.client.force_authenticate(self.owner)

		response = self.client.patch(
			reverse("league-detail", args=[league.id]),
			{"name": "Sunday Turbo", "emoji": "🔥", "is_archived": True}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		league.refresh_from_db()
		self.assertEqual(league.name, "Sunday Turbo")
		self.assertEqual(league.emoji, "🔥")
		self.assertTrue(league.is_archived)

	def test_a_member_cannot_touch_a_league(self):
		league = League.objects.create(club=self.club, name="Sunday")
		self.client.force_authenticate(self.helper)

		response = self.client.patch(
			reverse("league-detail", args=[league.id]), {"name": "Mine"}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_shelving_a_league_keeps_its_seasons(self):
		league = League.objects.create(club=self.club, name="Sunday")
		season = Season.objects.create(league=league, name="S1")
		self.client.force_authenticate(self.owner)

		self.client.patch(
			reverse("league-detail", args=[league.id]), {"is_archived": True}, format="json",
		)

		self.assertTrue(Season.objects.filter(pk=season.pk).exists())


class ClubVisibilityTests(APITestCase):
	"""Which clubs a reader is shown at all."""

	def setUp(self):
		self.owner = User.objects.create_user(username="v_owner", password="x")
		self.stranger = User.objects.create_user(username="v_stranger", password="x")
		self.boss = User.objects.create_superuser(username="v_boss", password="x")

		self.open_club = Club.objects.create(
			name="Open", slug="open", created_by=self.owner, is_public=True,
		)
		self.closed_club = Club.objects.create(
			name="Closed", slug="closed", created_by=self.owner, is_public=False,
		)
		for club in (self.open_club, self.closed_club):
			Membership.objects.create(club=club, user=self.owner, role=Membership.OWNER)

	def _listed(self, user):
		self.client.force_authenticate(user)
		return {club["slug"] for club in self.client.get(reverse("clubs")).data}

	def test_a_stranger_sees_only_what_is_open(self):
		self.assertEqual(self._listed(self.stranger), {"open"})

	def test_a_member_sees_their_own_private_club(self):
		self.assertEqual(self._listed(self.owner), {"open", "closed"})

	def test_the_superuser_sees_every_club_because_they_can_edit_every_club(self):
		"""They could already open one by its address and change it.

		Leaving private clubs out of their list only meant the account that can
		fix a club had no way of finding it.
		"""
		self.assertEqual(self._listed(self.boss), {"open", "closed"})
