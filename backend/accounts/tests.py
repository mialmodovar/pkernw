import base64
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .avatars import AVATAR_MAX_BYTES
from .models import AvatarImage, Profile

User = get_user_model()


class FinisherGifTests(APITestCase):
	"""The knockout GIF a player picks, stored on their theme."""

	def setUp(self):
		self.user = User.objects.create_user(username="finisher", password="secret123")
		self.client.force_authenticate(self.user)

	def _patch(self, **overrides):
		payload = {"preset": "burgundy", "accent": None, "pattern": "weave"}
		payload.update(overrides)
		return self.client.patch(reverse("update_theme"), payload, format="json")

	def test_a_picked_gif_is_saved_to_the_profile(self):
		response = self._patch(finisher_gif_id="3o7abKhOpu0NwenH3O")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.user.profile.refresh_from_db()
		self.assertEqual(self.user.profile.theme["finisher_gif_id"], "3o7abKhOpu0NwenH3O")

	def test_a_url_is_refused(self):
		response = self._patch(finisher_gif_id="https://evil.example/x.gif")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_clearing_the_finisher_stores_nothing_rather_than_a_blank(self):
		self._patch(finisher_gif_id="3o7abKhOpu0NwenH3O")

		response = self._patch(finisher_gif_id="")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.user.profile.refresh_from_db()
		self.assertIsNone(self.user.profile.theme["finisher_gif_id"])

	def test_a_theme_without_a_finisher_still_saves(self):
		response = self._patch()

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.user.profile.refresh_from_db()
		self.assertIsNone(self.user.profile.theme["finisher_gif_id"])


class WatchingTests(APITestCase):
	"""Keeping an eye on other players."""

	def setUp(self):
		self.me = User.objects.create_user(username="watcher", password="secret123")
		self.them = User.objects.create_user(username="rival", password="secret123")
		self.client.force_authenticate(self.me)

	def test_watching_somebody_puts_them_on_the_list(self):
		response = self.client.post(reverse("watching"), {"username": "rival"}, format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual([row["username"] for row in response.data], ["rival"])

	def test_watching_twice_does_not_list_them_twice(self):
		self.client.post(reverse("watching"), {"username": "rival"}, format="json")
		response = self.client.post(reverse("watching"), {"username": "rival"}, format="json")

		self.assertEqual(len(response.data), 1)

	def test_the_name_does_not_have_to_be_typed_exactly(self):
		response = self.client.post(reverse("watching"), {"username": "RIVAL"}, format="json")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(len(response.data), 1)

	def test_watching_yourself_is_refused(self):
		response = self.client.post(reverse("watching"), {"username": "watcher"}, format="json")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_watching_somebody_who_does_not_exist_says_so(self):
		response = self.client.post(reverse("watching"), {"username": "nobody"}, format="json")

		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

	def test_a_watch_can_be_dropped(self):
		self.client.post(reverse("watching"), {"username": "rival"}, format="json")

		response = self.client.delete(reverse("unwatch", args=["rival"]))

		self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
		self.assertEqual(self.client.get(reverse("watching")).data, [])

	def test_a_watch_list_is_nobody_elses_business(self):
		"""Watching is one-directional and unannounced: the watched player has
		no idea, and sees their own list rather than anybody's."""
		self.client.post(reverse("watching"), {"username": "rival"}, format="json")
		self.client.force_authenticate(self.them)

		self.assertEqual(self.client.get(reverse("watching")).data, [])

	def test_the_row_says_when_somebody_is_at_a_table(self):
		from tournaments.models import Tournament, TournamentPlayer

		tournament = Tournament.objects.create(host=self.them, name="Live", status="running")
		TournamentPlayer.objects.create(tournament=tournament, user=self.them, seat=0, chips=1000)
		self.client.post(reverse("watching"), {"username": "rival"}, format="json")

		response = self.client.get(reverse("watching"))

		self.assertTrue(response.data[0]["playing_now"])

	def test_somebody_sitting_in_a_lobby_is_not_playing_yet(self):
		from tournaments.models import Tournament, TournamentPlayer

		tournament = Tournament.objects.create(host=self.them, name="Later", status="lobby")
		TournamentPlayer.objects.create(tournament=tournament, user=self.them, seat=0, chips=1000)
		self.client.post(reverse("watching"), {"username": "rival"}, format="json")

		response = self.client.get(reverse("watching"))

		self.assertFalse(response.data[0]["playing_now"])

	def test_the_row_names_the_tournament_so_you_can_go_and_watch_it(self):
		from tournaments.models import Tournament, TournamentPlayer

		tournament = Tournament.objects.create(host=self.them, name="Friday KO", status="running")
		TournamentPlayer.objects.create(tournament=tournament, user=self.them, seat=0, chips=1000)
		self.client.post(reverse("watching"), {"username": "rival"}, format="json")

		row = self.client.get(reverse("watching")).data[0]

		self.assertEqual(row["tournament"]["id"], tournament.id)
		self.assertEqual(row["tournament"]["name"], "Friday KO")
		self.assertEqual(row["tournament"]["status"], "running")

	def test_a_player_knocked_out_of_a_running_tournament_is_no_longer_at_it(self):
		from tournaments.models import Tournament, TournamentPlayer

		tournament = Tournament.objects.create(host=self.them, name="Live", status="running")
		TournamentPlayer.objects.create(
			tournament=tournament, user=self.them, seat=0, chips=0,
			is_eliminated=True, finish_position=6,
		)
		self.client.post(reverse("watching"), {"username": "rival"}, format="json")

		row = self.client.get(reverse("watching")).data[0]

		self.assertFalse(row["playing_now"])
		self.assertIsNone(row["tournament"])

	def test_being_at_a_table_and_being_connected_to_it_are_different_things(self):
		"""A seat can sit disconnected for a whole level. The list says so
		rather than implying somebody is there when nobody is home."""
		from game import consumers
		from tournaments.models import Tournament, TournamentPlayer

		tournament = Tournament.objects.create(host=self.them, name="Live", status="running")
		TournamentPlayer.objects.create(tournament=tournament, user=self.them, seat=0, chips=1000)
		self.client.post(reverse("watching"), {"username": "rival"}, format="json")

		self.assertFalse(self.client.get(reverse("watching")).data[0]["online"])

		consumers._player_channels[(tournament.id, self.them.id)] = "channel!1"
		self.addCleanup(consumers._player_channels.pop, (tournament.id, self.them.id), None)

		row = self.client.get(reverse("watching")).data[0]
		self.assertTrue(row["online"])
		self.assertTrue(row["playing_now"])

	def test_the_row_carries_an_uploaded_avatar_when_there_is_one(self):
		self.client.post(reverse("watching"), {"username": "rival"}, format="json")

		self.assertIsNone(self.client.get(reverse("watching")).data[0]["avatar_url"])

		AvatarImage.objects.create(user=self.them, data=ONE_PIXEL_PNG, content_type="image/png")

		row = self.client.get(reverse("watching")).data[0]
		self.assertIn(f"/api/auth/avatar/{self.them.id}/", row["avatar_url"])
		# The emoji stays underneath it, as the fallback.
		self.assertEqual(row["avatar_emoji"], "🃏")


class DisplayNameTests(APITestCase):
	"""The name other players read, as against the one you log in with."""

	def setUp(self):
		self.user = User.objects.create_user(username="vasco", password="secret123")
		self.client.force_authenticate(self.user)

	def _set(self, name):
		return self.client.patch(reverse("update_display_name"), {"display_name": name}, format="json")

	def test_a_display_name_is_what_everybody_else_reads(self):
		response = self._set("Vasco F.")

		self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
		self.assertEqual(response.data["display_name"], "Vasco F.")
		me = self.client.get(reverse("me")).data
		self.assertEqual(me["profile"]["display_name"], "Vasco F.")
		# The login name is untouched: it keys the history and the ledger.
		self.assertEqual(me["username"], "vasco")

	def test_a_player_without_one_is_shown_their_username(self):
		self.assertEqual(self.client.get(reverse("me")).data["profile"]["display_name"], "vasco")

	def test_clearing_it_goes_back_to_the_username(self):
		self._set("Vasco F.")

		response = self._set("   ")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["display_name"], "vasco")
		self.user.profile.refresh_from_db()
		self.assertEqual(self.user.profile.display_name, "")

	def test_it_cannot_be_somebody_elses_login_name(self):
		User.objects.create_user(username="rui", password="secret123")

		response = self._set("Rui")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_it_cannot_be_a_name_already_taken(self):
		rival = User.objects.create_user(username="rui", password="secret123")
		Profile.objects.update_or_create(user=rival, defaults={"display_name": "The Rock"})

		response = self._set("the rock")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_keeping_your_own_name_is_not_taking_it_from_yourself(self):
		self._set("Vasco F.")

		self.assertEqual(self._set("Vasco F.").status_code, status.HTTP_200_OK)

	def test_a_name_is_squeezed_rather_than_stored_as_typed(self):
		self._set("  Vasco   F.  ")

		self.user.profile.refresh_from_db()
		self.assertEqual(self.user.profile.display_name, "Vasco F.")

	def test_it_has_a_ceiling(self):
		self.assertEqual(self._set("x" * 25).status_code, status.HTTP_400_BAD_REQUEST)

	def test_the_watch_list_and_the_profile_both_read_it(self):
		rival = User.objects.create_user(username="rui", password="secret123")
		Profile.objects.update_or_create(user=rival, defaults={"display_name": "The Rock"})
		self.client.post(reverse("watching"), {"username": "rui"}, format="json")

		row = self.client.get(reverse("watching")).data[0]
		self.assertEqual(row["display_name"], "The Rock")
		# Still filed under the login name, which is what unwatching uses.
		self.assertEqual(row["username"], "rui")

		card = self.client.get(reverse("player-profile", args=["rui"])).data
		self.assertEqual(card["display_name"], "The Rock")


class PlayerProfileTests(APITestCase):
	"""Looking somebody up."""

	def setUp(self):
		self.me = User.objects.create_user(username="looker", password="secret123")
		self.them = User.objects.create_user(username="subject", password="secret123")
		self.client.force_authenticate(self.me)

	def _finished_tournament(self, name, finish):
		from tournaments.models import Tournament, TournamentPlayer

		tournament = Tournament.objects.create(
			host=self.them, name=name, status="finished",
			payout_structure=[{"place": 1, "label": "1st", "percentage": 100}],
		)
		TournamentPlayer.objects.create(
			tournament=tournament, user=self.them, seat=0, chips=0, finish_position=finish,
		)
		return tournament

	def test_a_profile_carries_the_record_and_the_last_few_nights(self):
		self._finished_tournament("Tuesday", 1)
		self._finished_tournament("Wednesday", 4)

		response = self.client.get(reverse("player-profile", args=["subject"]))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["username"], "subject")
		self.assertEqual(response.data["stats"]["tournaments_played"], 2)
		self.assertEqual(response.data["stats"]["best_finish"], 1)
		self.assertEqual(response.data["stats"]["cashes"], 1)
		self.assertEqual(len(response.data["recent"]), 2)

	def test_the_last_few_nights_are_the_last_few(self):
		for index in range(7):
			self._finished_tournament(f"Night {index}", 2)

		response = self.client.get(reverse("player-profile", args=["subject"]))

		self.assertEqual(len(response.data["recent"]), 5)
		# Newest first: the one you want is the one you just played.
		self.assertEqual(response.data["recent"][0]["name"], "Night 6")

	def test_a_profile_says_whether_you_are_watching_them(self):
		self.assertFalse(self.client.get(reverse("player-profile", args=["subject"])).data["is_watched"])

		self.client.post(reverse("watching"), {"username": "subject"}, format="json")

		self.assertTrue(self.client.get(reverse("player-profile", args=["subject"])).data["is_watched"])

	def test_a_profile_says_where_they_are_right_now(self):
		from game import consumers
		from tournaments.models import Tournament, TournamentPlayer

		tournament = Tournament.objects.create(host=self.them, name="Friday KO", status="running")
		TournamentPlayer.objects.create(tournament=tournament, user=self.them, seat=0, chips=1000)
		consumers._player_channels[(tournament.id, self.them.id)] = "channel!1"
		self.addCleanup(consumers._player_channels.pop, (tournament.id, self.them.id), None)

		data = self.client.get(reverse("player-profile", args=["subject"])).data

		self.assertTrue(data["online"])
		self.assertEqual(data["tournament"]["id"], tournament.id)
		self.assertEqual(data["tournament"]["name"], "Friday KO")

	def test_a_profile_of_somebody_playing_nothing_offers_nowhere_to_go(self):
		data = self.client.get(reverse("player-profile", args=["subject"])).data

		self.assertFalse(data["online"])
		self.assertIsNone(data["tournament"])

	def test_looking_up_nobody_is_a_404(self):
		response = self.client.get(reverse("player-profile", args=["ghost"]))

		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# A real 1×1 PNG. Small enough to inline, and the point of the tests below is
# what the bytes say they are rather than what they draw.
ONE_PIXEL_PNG = base64.b64decode(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


class AvatarImageTests(APITestCase):
	"""The picture a player uploads instead of one of the emoji."""

	def setUp(self):
		self.user = User.objects.create_user(username="shutterbug", password="secret123")
		self.client.force_authenticate(self.user)

	def _upload(self, content, name="avatar.png", content_type="image/png"):
		return self.client.put(
			reverse("avatar_image"),
			{"image": SimpleUploadedFile(name, content, content_type=content_type)},
			format="multipart",
		)

	def test_an_uploaded_picture_becomes_the_profile_avatar(self):
		response = self._upload(ONE_PIXEL_PNG)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertIn(f"/api/auth/avatar/{self.user.id}/", response.data["avatar_url"])

		me = self.client.get(reverse("me"))
		self.assertEqual(me.data["profile"]["avatar_url"], response.data["avatar_url"])
		# The emoji is still there underneath, ready for the picture being removed.
		self.assertEqual(me.data["profile"]["avatar_emoji"], "🃏")

	def test_the_bytes_are_served_back_as_the_type_they_actually_are(self):
		url = self._upload(ONE_PIXEL_PNG).data["avatar_url"]

		# No credentials: an <img> cannot carry a bearer token.
		self.client.force_authenticate(None)
		response = self.client.get(url)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response["Content-Type"], "image/png")
		self.assertEqual(response["X-Content-Type-Options"], "nosniff")
		self.assertEqual(response.content, ONE_PIXEL_PNG)

	def test_a_player_without_a_picture_has_none(self):
		me = self.client.get(reverse("me"))
		self.assertIsNone(me.data["profile"]["avatar_url"])

		response = self.client.get(reverse("avatar_image_for_user", args=[self.user.id]))
		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

	def test_a_file_that_is_not_an_image_is_refused_whatever_it_claims_to_be(self):
		svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'

		response = self._upload(svg, name="avatar.png", content_type="image/png")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertFalse(AvatarImage.objects.filter(user=self.user).exists())

	def test_an_oversized_upload_is_refused(self):
		response = self._upload(ONE_PIXEL_PNG + b"\0" * AVATAR_MAX_BYTES)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertFalse(AvatarImage.objects.filter(user=self.user).exists())

	def test_replacing_a_picture_changes_its_url(self):
		self._upload(ONE_PIXEL_PNG)
		# Aged deliberately: the URL has to change because the picture did, and
		# reading yesterday's back is how that is asserted without depending on
		# how quickly two uploads can follow each other.
		AvatarImage.objects.filter(user=self.user).update(
			updated_at=timezone.now() - timedelta(days=1),
		)
		yesterday = self.client.get(reverse("me")).data["profile"]["avatar_url"]

		today = self._upload(ONE_PIXEL_PNG).data["avatar_url"]

		# One row, one picture — and a URL nothing has cached under.
		self.assertEqual(AvatarImage.objects.filter(user=self.user).count(), 1)
		self.assertNotEqual(yesterday, today)
		self.assertEqual(self.client.get(reverse("me")).data["profile"]["avatar_url"], today)

	def test_removing_the_picture_uncovers_the_emoji(self):
		self._upload(ONE_PIXEL_PNG)

		response = self.client.delete(reverse("avatar_image"))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertIsNone(response.data["avatar_url"])
		self.assertFalse(AvatarImage.objects.filter(user=self.user).exists())
		me = self.client.get(reverse("me"))
		self.assertIsNone(me.data["profile"]["avatar_url"])
		self.assertEqual(me.data["profile"]["avatar_emoji"], "🃏")

	def test_somebody_else_cannot_upload_over_your_avatar(self):
		self.client.force_authenticate(None)

		response = self._upload(ONE_PIXEL_PNG)

		self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class ProfileClubTagTests(APITestCase):
	"""The clubs shown on somebody's card, and the ones that are not."""

	def setUp(self):
		self.me = User.objects.create_user(username="tag_me", password="secret123")
		self.them = User.objects.create_user(username="tag_them", password="secret123")
		self.client.force_authenticate(self.me)

	def _club(self, name, is_public, *members):
		from clubs.models import Club, Membership

		club = Club.objects.create(name=name, is_public=is_public, created_by=self.them)
		for user in members:
			Membership.objects.create(club=club, user=user)
		return club

	def _clubs_on(self, username="tag_them"):
		response = self.client.get(reverse("player-profile", args=[username]))
		return [club["name"] for club in response.data["clubs"]]

	def test_a_public_club_is_on_the_card(self):
		self._club("Open House", True, self.them)

		self.assertEqual(self._clubs_on(), ["Open House"])

	def test_a_private_club_is_not_announced_to_outsiders(self):
		"""Otherwise a profile card lists every private club its owner has ever
		joined, which is the one thing private means."""
		self._club("Back Room", False, self.them)

		self.assertEqual(self._clubs_on(), [])

	def test_a_private_club_you_are_both_in_is_shown(self):
		self._club("Back Room", False, self.them, self.me)

		self.assertEqual(self._clubs_on(), ["Back Room"])

	def test_the_tag_carries_what_it_takes_to_jump_there(self):
		club = self._club("Open House", True, self.them)

		response = self.client.get(reverse("player-profile", args=["tag_them"]))

		tag = response.data["clubs"][0]
		self.assertEqual(tag["slug"], club.slug)
		self.assertEqual(tag["emoji"], club.emoji)

	def test_somebody_in_no_clubs_has_no_tags(self):
		self.assertEqual(self._clubs_on(), [])

	def test_a_club_is_listed_once_however_many_people_are_in_it(self):
		"""The membership join would otherwise repeat the club per member."""
		other = User.objects.create_user(username="tag_other", password="secret123")
		self._club("Open House", True, self.them, self.me, other)

		self.assertEqual(self._clubs_on(), ["Open House"])
