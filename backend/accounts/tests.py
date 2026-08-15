from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

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
