import base64
from datetime import timedelta

from asgiref.sync import async_to_sync, sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, TransactionTestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from game.models import Hand, HandAction
from poker_platform.asgi import application
from tournaments.models import LedgerEntry, Tournament, TournamentPlayer

from . import presence
from .avatars import AVATAR_MAX_BYTES
from .consumers import PresenceConsumer
from .notify import notify_user
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

	def test_the_deck_a_player_reads_best_is_saved_with_the_theme(self):
		response = self._patch(deck="inverted")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.user.profile.refresh_from_db()
		self.assertEqual(self.user.profile.theme["deck"], "inverted")

	def test_a_theme_that_names_no_deck_gets_the_printed_one(self):
		"""Every profile saved before the setting existed, and every client that
		has not been updated."""
		response = self._patch()

		self.assertEqual(response.data["deck"], "classic")

	def test_a_chosen_card_back_colour_is_saved(self):
		response = self._patch(card_back="#1f4fd8")

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.user.profile.refresh_from_db()
		self.assertEqual(self.user.profile.theme["card_back"], "#1f4fd8")

	def test_no_colour_means_the_one_the_theme_prints(self):
		self.assertIsNone(self._patch().data["card_back"])

	def test_a_card_back_that_is_not_a_colour_is_refused(self):
		self.assertEqual(
			self._patch(card_back="rebeccapurple").status_code, status.HTTP_400_BAD_REQUEST,
		)

	def test_a_deck_nobody_prints_is_refused(self):
		response = self._patch(deck="holographic")

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

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

	def test_three_finishers_are_saved_with_their_sounds(self):
		response = self._patch(finishers=[
			{"gif_id": "aaa111", "sound": "airhorn"},
			{"gif_id": "bbb222", "sound": "boom"},
			{"gif_id": "ccc333"},
		])

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.user.profile.refresh_from_db()
		self.assertEqual(self.user.profile.theme["finishers"], [
			{"gif_id": "aaa111", "sound": "airhorn"},
			{"gif_id": "bbb222", "sound": "boom"},
			{"gif_id": "ccc333", "sound": "none"},
		])

	def test_a_fourth_finisher_is_refused(self):
		response = self._patch(finishers=[{"gif_id": f"gif{index}"} for index in range(4)])

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_a_url_or_an_invented_sound_never_reaches_another_screen(self):
		"""These play on other people's tables, so neither is corrected — the
		GIF is dropped and the sound falls back to silence."""
		response = self._patch(finishers=[
			{"gif_id": "https://evil.example/x.gif", "sound": "airhorn"},
			{"gif_id": "good111", "sound": "../../etc/passwd"},
		])

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.user.profile.refresh_from_db()
		self.assertEqual(
			self.user.profile.theme["finishers"], [{"gif_id": "good111", "sound": "none"}],
		)

	def test_the_same_gif_twice_is_kept_once(self):
		self._patch(finishers=[{"gif_id": "same11"}, {"gif_id": "same11", "sound": "boom"}])

		self.user.profile.refresh_from_db()
		self.assertEqual(self.user.profile.theme["finishers"], [{"gif_id": "same11", "sound": "none"}])


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

	def test_having_the_app_open_is_enough_to_be_online(self):
		"""Online used to mean "sitting at a table with a socket open", so
		somebody reading the lobby with the app in front of them showed as
		offline to everybody watching them."""
		self.client.post(reverse("watching"), {"username": "rival"}, format="json")
		self.assertFalse(self.client.get(reverse("watching")).data[0]["online"])

		presence.arrived(self.them.id)
		self.addCleanup(presence.left, self.them.id)

		row = self.client.get(reverse("watching")).data[0]
		self.assertTrue(row["online"])
		# At no table, so no ring and nowhere to go and watch them.
		self.assertFalse(row["playing_now"])

	def test_closing_one_of_two_tabs_does_not_take_you_offline(self):
		self.client.post(reverse("watching"), {"username": "rival"}, format="json")
		presence.arrived(self.them.id)
		presence.arrived(self.them.id)
		self.addCleanup(presence.left, self.them.id)

		presence.left(self.them.id)

		self.assertTrue(self.client.get(reverse("watching")).data[0]["online"])

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


class BestHandStatTests(APITestCase):
	"""The best hand a player has ever turned over, on their own stats."""

	def setUp(self):
		self.user = User.objects.create_user(username="hero", password="secret123")
		self.other = User.objects.create_user(username="villain", password="secret123")
		self.client.force_authenticate(self.user)
		self.tournament = Tournament.objects.create(host=self.user, name="Thursday", status="finished")

	def _hand(self, *, number, seat, hand_name, score, cards, community):
		"""One finished hand our player showed down in, from a seat of its own.

		The seat goes on the action rather than on the player, which is what the
		real thing does: a seat_at_table moves when tables rebalance, so the
		seat somebody showed down in is not the seat they are in now.
		"""
		tp, _ = TournamentPlayer.objects.get_or_create(
			tournament=self.tournament, user=self.user, defaults={"seat": 0, "chips": 0}
		)
		hand = Hand.objects.create(
			tournament=self.tournament,
			hand_number=number,
			level_index=0,
			dealer_seat=0,
			community_cards=community,
			status="complete",
			result={"showdown": [
				{"seat": seat, "cards": cards, "hand_name": hand_name, "score": score},
				{"seat": 8, "cards": ["2h", "3d"], "hand_name": "High Card", "score": [0, 9]},
			]},
		)
		HandAction.objects.create(hand=hand, player=tp, seat=seat, street="preflop", action="call", amount=20)
		return hand

	def test_the_best_of_several_showdowns_is_the_one_reported(self):
		self._hand(number=1, seat=3, hand_name="Two Pair", score=[2, 10, 4, 13],
			cards=["Th", "4s"], community=["Td", "4c", "Kh", "9s", "2d"])
		monster = self._hand(number=2, seat=5, hand_name="Full House", score=[6, 12, 7],
			cards=["Qh", "Qs"], community=["Qd", "7c", "7h", "2s", "3d"])

		response = self.client.get(reverse("my_stats"))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		best = response.data["best_hand"]
		self.assertEqual(best["name"], "Full House")
		self.assertEqual(best["hand_id"], monster.id)
		self.assertEqual(best["cards"], ["Qh", "Qs"])
		self.assertEqual(best["tournament_name"], "Thursday")

	def test_somebody_elses_showdown_is_not_yours(self):
		# The seat in the showdown is not the seat our player acted from, so
		# nothing in this hand belongs to them.
		self._hand(number=1, seat=3, hand_name="Two Pair", score=[2, 10, 4, 13],
			cards=["Th", "4s"], community=["Td", "4c", "Kh", "9s", "2d"])
		Hand.objects.filter(hand_number=1).update(
			result={"showdown": [{"seat": 8, "cards": ["Ah", "As"], "hand_name": "Four of a Kind", "score": [7, 14, 9]}]}
		)

		response = self.client.get(reverse("my_stats"))

		self.assertIsNone(response.data["best_hand"])

	def test_a_player_who_has_never_shown_down_has_none(self):
		response = self.client.get(reverse("my_stats"))
		self.assertIsNone(response.data["best_hand"])

	def test_the_hand_can_be_read_back_on_its_own(self):
		monster = self._hand(number=2, seat=5, hand_name="Full House", score=[6, 12, 7],
			cards=["Qh", "Qs"], community=["Qd", "7c", "7h", "2s", "3d"])

		response = self.client.get(reverse("hand-detail", args=[monster.id]))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["community_cards"], ["Qd", "7c", "7h", "2s", "3d"])
		self.assertEqual(response.data["result"]["showdown"][0]["hand_name"], "Full House")


class MoneyAndItmStatTests(APITestCase):
	"""Cashes as a rate, and what has actually been taken home."""

	def setUp(self):
		self.user = User.objects.create_user(username="hero", password="secret123")
		self.client.force_authenticate(self.user)

	def _played(self, *, name, finish, paid_places=2, prize_cents=0):
		tournament = Tournament.objects.create(
			host=self.user, name=name, status="finished",
			payout_structure=[{"place": place + 1} for place in range(paid_places)],
		)
		TournamentPlayer.objects.create(
			tournament=tournament, user=self.user, seat=0, chips=0, finish_position=finish,
		)
		if prize_cents:
			LedgerEntry.objects.create(
				tournament=tournament, user=self.user, stake_cents=1000, prize_cents=prize_cents,
			)
		return tournament

	def test_in_the_money_is_a_share_of_the_nights_that_finished(self):
		self._played(name="one", finish=1, prize_cents=5000)
		self._played(name="two", finish=2, prize_cents=2000)
		self._played(name="three", finish=7)
		self._played(name="four", finish=9)

		stats = self.client.get(reverse("my_stats")).data

		self.assertEqual(stats["cashes"], 2)
		self.assertEqual(stats["tournaments_completed"], 4)
		self.assertEqual(stats["itm_pct"], 50)

	def test_a_tournament_still_in_play_counts_neither_way(self):
		self._played(name="done", finish=1, prize_cents=5000)
		running = Tournament.objects.create(host=self.user, name="tonight", status="running")
		TournamentPlayer.objects.create(tournament=running, user=self.user, seat=0, chips=1000)

		stats = self.client.get(reverse("my_stats")).data

		self.assertEqual(stats["tournaments_played"], 2)
		self.assertEqual(stats["tournaments_completed"], 1)
		self.assertEqual(stats["itm_pct"], 100)

	def test_winnings_are_everything_taken_home(self):
		self._played(name="one", finish=1, prize_cents=5000)
		self._played(name="two", finish=2, prize_cents=2000)

		self.assertEqual(self.client.get(reverse("my_stats")).data["winnings_cents"], 7000)

	def test_a_player_with_no_record_reads_zero_rather_than_dividing_by_it(self):
		stats = self.client.get(reverse("my_stats")).data
		self.assertEqual(stats["itm_pct"], 0)
		self.assertEqual(stats["winnings_cents"], 0)


class TablePreferencesTests(APITestCase):
	"""Chips or big blinds, kept on the account rather than in a browser."""

	def setUp(self):
		self.user = User.objects.create_user(username="pref_player", password="secret123")
		self.client.force_authenticate(self.user)

	def test_a_new_account_has_no_opinion_yet(self):
		me = self.client.get(reverse("me")).data

		self.assertEqual(me["profile"]["preferences"], {})

	def test_saving_the_preference_puts_it_on_the_account(self):
		response = self.client.patch(
			reverse("update_preferences"), {"show_bb": True}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data, {"show_bb": True})
		# And it comes back with the account, which is what makes it follow a
		# player to another browser.
		me = self.client.get(reverse("me")).data
		self.assertEqual(me["profile"]["preferences"]["show_bb"], True)

	def test_the_preference_can_be_turned_back_off(self):
		self.client.patch(reverse("update_preferences"), {"show_bb": True}, format="json")
		self.client.patch(reverse("update_preferences"), {"show_bb": False}, format="json")

		me = self.client.get(reverse("me")).data
		self.assertEqual(me["profile"]["preferences"]["show_bb"], False)

	def test_a_preference_this_client_does_not_know_about_survives_being_edited(self):
		"""Merged rather than replaced.

		A newer client on another device may have saved something this one has
		never heard of, and toggling blinds here must not wipe it.
		"""
		from accounts.models import Profile

		profile, _ = Profile.objects.get_or_create(user=self.user)
		profile.preferences = {"show_bb": False, "something_newer": "kept"}
		profile.save(update_fields=["preferences"])

		self.client.patch(reverse("update_preferences"), {"show_bb": True}, format="json")

		profile.refresh_from_db()
		self.assertEqual(profile.preferences, {"show_bb": True, "something_newer": "kept"})

	def test_rubbish_is_refused_rather_than_stored(self):
		response = self.client.patch(
			reverse("update_preferences"), {"show_bb": "yes please"}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_somebody_else_cannot_set_your_preferences(self):
		self.client.force_authenticate(None)

		response = self.client.patch(
			reverse("update_preferences"), {"show_bb": True}, format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class RecoveryCodeTests(APITestCase):
	"""Getting back in without an email address."""

	def _register(self, username="rec_player", password="secret123"):
		return self.client.post(
			reverse("register"), {"username": username, "password": password}, format="json",
		)

	def test_registering_hands_back_a_recovery_code_once(self):
		response = self._register()

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		code = response.data["recovery_code"]
		# Sixteen characters in four groups, the way it is meant to be written
		# down and read back.
		self.assertEqual(len(code.split("-")), 4)
		self.assertEqual(len(code.replace("-", "")), 16)
		# Kept as a hash, never in the clear — the same rule as the password.
		from accounts.models import Profile

		profile = Profile.objects.get(user__username="rec_player")
		self.assertTrue(profile.recovery_code_hash)
		self.assertNotIn(code.replace("-", ""), profile.recovery_code_hash)

	def test_the_code_sets_a_new_password(self):
		code = self._register().data["recovery_code"]

		response = self.client.post(
			reverse("recover_password"),
			{"username": "rec_player", "recovery_code": code, "new_password": "brand new"},
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		login = self.client.post(
			reverse("token_obtain"),
			{"username": "rec_player", "password": "brand new"}, format="json",
		)
		self.assertEqual(login.status_code, status.HTTP_200_OK)

	def test_a_used_code_does_not_work_twice(self):
		"""A code that has got somebody in once is a password in a chat history."""
		code = self._register().data["recovery_code"]
		first = self.client.post(
			reverse("recover_password"),
			{"username": "rec_player", "recovery_code": code, "new_password": "brand new"},
			format="json",
		)

		again = self.client.post(
			reverse("recover_password"),
			{"username": "rec_player", "recovery_code": code, "new_password": "later still"},
			format="json",
		)

		self.assertEqual(again.status_code, status.HTTP_400_BAD_REQUEST)
		# The replacement came back with the first recovery, and that one works.
		self.assertNotEqual(first.data["recovery_code"], code)
		third = self.client.post(
			reverse("recover_password"),
			{"username": "rec_player", "recovery_code": first.data["recovery_code"],
			 "new_password": "later still"},
			format="json",
		)
		self.assertEqual(third.status_code, status.HTTP_200_OK)

	def test_the_code_is_read_the_way_it_was_written_down(self):
		code = self._register().data["recovery_code"]
		typed = code.replace("-", " ").lower()

		response = self.client.post(
			reverse("recover_password"),
			{"username": "REC_PLAYER", "recovery_code": typed, "new_password": "brand new"},
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)

	def test_a_wrong_code_is_refused(self):
		self._register()

		response = self.client.post(
			reverse("recover_password"),
			{"username": "rec_player", "recovery_code": "AAAA-BBBB-CCCC-DDDD",
			 "new_password": "brand new"},
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_a_name_nobody_has_is_refused_the_same_way(self):
		"""The refusal must not say which half was wrong.

		Telling "no such player" apart from "wrong code" hands over the guest
		list to anybody who asks for it.
		"""
		self._register()

		unknown = self.client.post(
			reverse("recover_password"),
			{"username": "nobody_here", "recovery_code": "AAAA-BBBB-CCCC-DDDD",
			 "new_password": "brand new"},
			format="json",
		)
		wrong_code = self.client.post(
			reverse("recover_password"),
			{"username": "rec_player", "recovery_code": "AAAA-BBBB-CCCC-DDDD",
			 "new_password": "brand new"},
			format="json",
		)

		self.assertEqual(unknown.status_code, wrong_code.status_code)
		self.assertEqual(unknown.data["error"], wrong_code.data["error"])

	def test_a_short_password_is_refused(self):
		code = self._register().data["recovery_code"]

		response = self.client.post(
			reverse("recover_password"),
			{"username": "rec_player", "recovery_code": code, "new_password": "abc"},
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_a_player_can_replace_their_own_code(self):
		self._register()
		user = User.objects.get(username="rec_player")
		self.client.force_authenticate(user)

		response = self.client.post(reverse("reset_recovery_code"))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		new_code = response.data["recovery_code"]
		self.client.force_authenticate(None)
		works = self.client.post(
			reverse("recover_password"),
			{"username": "rec_player", "recovery_code": new_code, "new_password": "brand new"},
			format="json",
		)
		self.assertEqual(works.status_code, status.HTTP_200_OK)

	def test_an_account_from_before_recovery_codes_cannot_be_taken_with_a_guess(self):
		"""A blank hash must never match anything, empty code included."""
		from accounts.models import Profile

		user = User.objects.create_user(username="rec_old", password="secret123")
		Profile.objects.update_or_create(user=user, defaults={"recovery_code_hash": ""})

		for attempt in ("", "AAAA-BBBB-CCCC-DDDD"):
			with self.subTest(code=attempt):
				response = self.client.post(
					reverse("recover_password"),
					{"username": "rec_old", "recovery_code": attempt, "new_password": "brand new"},
					format="json",
				)
				self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class PlayerSearchTests(APITestCase):
	"""The box that suggests people to watch."""

	def setUp(self):
		from accounts.models import Profile

		self.me = User.objects.create_user(username="searcher", password="x")
		self.ana = User.objects.create_user(username="ana", password="x")
		self.yohan = User.objects.create_user(username="yohan", password="x")
		self.hidden = User.objects.create_user(username="zephyr", password="x")
		Profile.objects.update_or_create(user=self.yohan, defaults={"display_name": "Big Ana Fan"})
		self.client.force_authenticate(self.me)

	def _search(self, query):
		response = self.client.get(reverse("search_players"), {"q": query})
		return [row["username"] for row in response.data]

	def test_one_letter_is_not_a_suggestion(self):
		self.assertEqual(self._search("a"), [])

	def test_it_matches_the_name_they_signed_up_with(self):
		self.assertIn("ana", self._search("an"))

	def test_it_matches_the_name_they_go_by(self):
		"""Whoever is looking knows one of the two names, not which one."""
		self.assertIn("yohan", self._search("Big Ana"))

	def test_whoever_starts_with_it_comes_first(self):
		results = self._search("ana")
		self.assertEqual(results[0], "ana")

	def test_it_never_suggests_you_to_yourself(self):
		self.assertNotIn("searcher", self._search("search"))

	def test_it_stops_suggesting_somebody_you_already_watch(self):
		self.client.post(reverse("watching"), {"username": "ana"}, format="json")

		self.assertNotIn("ana", self._search("ana"))

	def test_it_says_what_each_player_is_called_and_looks_like(self):
		row = self.client.get(reverse("search_players"), {"q": "yohan"}).data[0]

		self.assertEqual(row["display_name"], "Big Ana Fan")
		self.assertIn("avatar_emoji", row)
		self.assertIn("avatar_url", row)

	def test_a_stranger_cannot_browse_the_player_list(self):
		self.client.force_authenticate(None)

		response = self.client.get(reverse("search_players"), {"q": "ana"})

		self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class RecoveryCodeReportingTests(APITestCase):
	"""Whether the account says it has a way back in."""

	def test_a_new_account_reports_that_it_has_one(self):
		self.client.post(
			reverse("register"), {"username": "has_code", "password": "secret123"}, format="json",
		)
		self.client.force_authenticate(User.objects.get(username="has_code"))

		me = self.client.get(reverse("me")).data

		self.assertTrue(me["profile"]["has_recovery_code"])

	def test_an_account_from_before_recovery_codes_reports_that_it_has_none(self):
		"""Which is what puts the offer of one on their lobby."""
		user = User.objects.create_user(username="no_code", password="secret123")
		self.client.force_authenticate(user)

		me = self.client.get(reverse("me")).data

		self.assertFalse(me["profile"]["has_recovery_code"])

	def test_the_code_itself_is_never_reported(self):
		self.client.post(
			reverse("register"), {"username": "secret_code", "password": "secret123"}, format="json",
		)
		self.client.force_authenticate(User.objects.get(username="secret_code"))

		me = self.client.get(reverse("me")).data

		self.assertNotIn("recovery_code", me["profile"])
		self.assertNotIn("recovery_code_hash", me["profile"])


class StatsByGameTypeTests(APITestCase):
	"""Stats for one kind of game at a time.

	A three-handed Spin n Go and a nine-handed tournament are different games,
	and a single average across both describes neither.
	"""

	def setUp(self):
		from tournaments.models import LedgerEntry, Tournament, TournamentPlayer

		self.Tournament, self.TournamentPlayer = Tournament, TournamentPlayer
		self.user = User.objects.create_user(username="stat_player", password="x")
		self.client.force_authenticate(self.user)

		# A tournament won, a Spin n Go lost, a Sit n Go second.
		self._played("standard", finish=1, prize=5000, payouts=2)
		self._played("spingo", finish=3, prize=0, payouts=1, seats=3)
		self._played("sitngo", finish=2, prize=1200, payouts=2, seats=6)

	def _played(self, fmt, *, finish, prize, payouts, seats=9):
		from tournaments.models import LedgerEntry, Tournament, TournamentPlayer

		tournament = Tournament.objects.create(
			host=self.user, name=f"{fmt} night", format=fmt, status="finished",
			max_players=seats, players_per_table=seats, buy_in_cents=2000,
			payout_structure=[
				{"place": place, "label": f"{place}", "percentage": 100 // payouts}
				for place in range(1, payouts + 1)
			],
		)
		TournamentPlayer.objects.create(
			tournament=tournament, user=self.user, seat=0, chips=0,
			finish_position=finish, is_eliminated=finish != 1,
		)
		LedgerEntry.objects.create(
			tournament=tournament, user=self.user, stake_cents=2000, prize_cents=prize,
		)
		return tournament

	def _stats(self, game=None):
		return self.client.get(reverse("my_stats"), {"game": game} if game else {}).data

	def test_everything_is_counted_together_by_default(self):
		stats = self._stats()

		self.assertEqual(stats["scope"], "all")
		self.assertEqual(stats["tournaments_played"], 3)
		self.assertEqual(stats["winnings_cents"], 6200)

	def test_tournaments_alone(self):
		stats = self._stats("tournaments")

		self.assertEqual(stats["tournaments_played"], 1)
		self.assertEqual(stats["winnings_cents"], 5000)
		self.assertEqual(stats["best_finish"], 1)
		self.assertEqual(stats["cashes"], 1)

	def test_spin_n_gos_alone(self):
		stats = self._stats("spingo")

		self.assertEqual(stats["tournaments_played"], 1)
		self.assertEqual(stats["winnings_cents"], 0)
		# Third of three, in a format that pays one.
		self.assertEqual(stats["cashes"], 0)
		self.assertEqual(stats["itm_pct"], 0)

	def test_sit_n_gos_alone(self):
		stats = self._stats("sitngo")

		self.assertEqual(stats["tournaments_played"], 1)
		self.assertEqual(stats["winnings_cents"], 1200)
		self.assertEqual(stats["cashes"], 1)
		self.assertEqual(stats["itm_pct"], 100)

	def test_the_scopes_add_up_to_the_whole(self):
		"""Nothing is counted twice and nothing is missed."""
		parts = [self._stats(one) for one in ("tournaments", "spingo", "sitngo")]

		self.assertEqual(sum(one["tournaments_played"] for one in parts), 3)
		self.assertEqual(sum(one["winnings_cents"] for one in parts), 6200)

	def test_a_game_nobody_offers_reads_as_everything(self):
		"""A stats panel is not worth a 400."""
		stats = self._stats("backgammon")

		self.assertEqual(stats["scope"], "all")
		self.assertEqual(stats["tournaments_played"], 3)

	def test_the_answer_says_which_scope_it_is(self):
		self.assertEqual(self._stats("spingo")["scope"], "spingo")


class PresenceSocketTests(TestCase):
	"""The socket the app holds open, and the count of who has one."""

	def setUp(self):
		self.user = User.objects.create_user(username="present", password="secret123")

	def tearDown(self):
		presence._socket_counts.clear()

	def _communicator(self, user):
		communicator = WebsocketCommunicator(PresenceConsumer.as_asgi(), "/ws/presence/")
		communicator.scope["user"] = user
		return communicator

	def test_a_connected_socket_makes_its_owner_online(self):
		async def scenario():
			socket = self._communicator(self.user)
			connected, _ = await socket.connect()
			self.assertTrue(connected)
			self.assertIn(self.user.id, presence.online_user_ids())
			await socket.disconnect()

		async_to_sync(scenario)()
		self.assertNotIn(self.user.id, presence.online_user_ids())

	def test_two_sockets_survive_one_of_them_closing(self):
		async def scenario():
			first, second = self._communicator(self.user), self._communicator(self.user)
			await first.connect()
			await second.connect()

			await first.disconnect()
			self.assertIn(self.user.id, presence.online_user_ids())

			await second.disconnect()
			self.assertNotIn(self.user.id, presence.online_user_ids())

		async_to_sync(scenario)()

	def test_a_socket_with_nobody_behind_it_is_refused(self):
		async def scenario():
			socket = self._communicator(AnonymousUser())
			connected, _ = await socket.connect()
			self.assertFalse(connected)
			await socket.disconnect()

		async_to_sync(scenario)()
		self.assertEqual(presence.online_user_ids(), set())


class PlayerAlertTests(TestCase):
	"""Reaching a player who is not looking at the thing being said.

	The presence socket is the only one open from every page, so it is the only
	way to tell somebody at one table that a game of theirs at another has
	started. These pin the delivery itself; that a filled fast game sends one is
	pinned in tournaments.tests.
	"""

	def setUp(self):
		self.ana = User.objects.create_user(username="alert_ana", password="secret123")
		self.bea = User.objects.create_user(username="alert_bea", password="secret123")

	def tearDown(self):
		presence._socket_counts.clear()

	def _communicator(self, user):
		communicator = WebsocketCommunicator(PresenceConsumer.as_asgi(), "/ws/presence/")
		communicator.scope["user"] = user
		return communicator

	def test_a_message_reaches_the_player_it_is_for(self):
		async def scenario():
			socket = self._communicator(self.ana)
			await socket.connect()
			# notify_user is sync, and sync code called from inside a running loop
			# has to go back out through a thread — which is how a view calls it.
			sent = await sync_to_async(notify_user)(self.ana.id, {"type": "hello", "n": 1})
			self.assertTrue(sent)

			message = await socket.receive_json_from(timeout=1)
			await socket.disconnect()
			return message

		self.assertEqual(async_to_sync(scenario)(), {"type": "hello", "n": 1})

	def test_a_message_reaches_nobody_else(self):
		"""One group per player. Everybody's own news, and only their own."""
		async def scenario():
			mine, theirs = self._communicator(self.ana), self._communicator(self.bea)
			await mine.connect()
			await theirs.connect()

			await sync_to_async(notify_user)(self.ana.id, {"type": "hello"})
			await mine.receive_json_from(timeout=1)
			quiet = await theirs.receive_nothing(timeout=0.3)

			await mine.disconnect()
			await theirs.disconnect()
			return quiet

		self.assertTrue(async_to_sync(scenario)())

	def test_both_of_a_players_tabs_are_told(self):
		"""The app open twice is one player, and the news is for the player."""
		async def scenario():
			first, second = self._communicator(self.ana), self._communicator(self.ana)
			await first.connect()
			await second.connect()

			await sync_to_async(notify_user)(self.ana.id, {"type": "hello"})
			both = [
				await first.receive_json_from(timeout=1),
				await second.receive_json_from(timeout=1),
			]

			await first.disconnect()
			await second.disconnect()
			return both

		self.assertEqual(async_to_sync(scenario)(), [{"type": "hello"}] * 2)

	def test_telling_somebody_who_is_not_there_is_not_an_error(self):
		"""A player with the app shut has no socket and no group. That is a
		delivery to nowhere, and the thing that prompted it still happened."""
		self.assertTrue(notify_user(self.bea.id, {"type": "hello"}))

	def test_a_closed_socket_stops_being_told(self):
		async def scenario():
			socket = self._communicator(self.ana)
			await socket.connect()
			await socket.disconnect()

			# Nothing to assert on the socket itself; what matters is that the
			# group no longer holds a channel pointing at it, and that sending
			# into it is still harmless.
			return await sync_to_async(notify_user)(self.ana.id, {"type": "hello"})

		self.assertTrue(async_to_sync(scenario)())


class PresenceRoutingTests(TransactionTestCase):
	"""The whole path a browser takes: the URL, the token, the consumer.

	The tests above hand the consumer a user directly, so on their own they
	would still pass if the route were never registered or the token never
	read.
	"""

	def tearDown(self):
		presence._socket_counts.clear()

	def test_the_app_reaches_presence_with_a_token_in_the_query_string(self):
		user = User.objects.create_user(username="router", password="secret123")
		token = str(AccessToken.for_user(user))

		async def scenario():
			socket = WebsocketCommunicator(application, f"/ws/presence/?token={token}")
			connected, _ = await socket.connect()
			self.assertTrue(connected)
			self.assertIn(user.id, presence.online_user_ids())
			await socket.disconnect()

		async_to_sync(scenario)()
		self.assertEqual(presence.online_user_ids(), set())

	def test_a_socket_with_no_token_is_refused(self):
		async def scenario():
			socket = WebsocketCommunicator(application, "/ws/presence/")
			connected, _ = await socket.connect()
			self.assertFalse(connected)
			await socket.disconnect()

		async_to_sync(scenario)()
		self.assertEqual(presence.online_user_ids(), set())

