from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from game.throwables import unlock_key

from .economy import (
    DAILY_COINS,
    SIGNUP_COINS,
    can_claim_daily,
    claim_daily,
    grant,
    owned_items,
    spend,
    wallet_for,
)
from .games import PLAYER_BET, clean_stake, game_for
from .models import CoinLedger, Unlock
from .shop import buy_throwable, catalogue, owns_throwable

User = get_user_model()


class SideGameRulesTests(TestCase):
    """The part of a side game that is arithmetic and nothing else."""

    def test_backing_one_of_six_pays_six(self):
        self.assertEqual(PLAYER_BET.payout(50, 6), 300)

    def test_heads_up_pays_double(self):
        self.assertEqual(PLAYER_BET.payout(50, 2), 100)

    def test_a_stake_outside_the_limits_is_refused_not_trimmed(self):
        self.assertIsNone(clean_stake(PLAYER_BET, PLAYER_BET.max_stake + 1))
        self.assertIsNone(clean_stake(PLAYER_BET, 0))
        self.assertIsNone(clean_stake(PLAYER_BET, "lots"))

    def test_a_stake_inside_them_comes_back_as_a_number(self):
        self.assertEqual(clean_stake(PLAYER_BET, "75"), 75)

    def test_a_game_nobody_has_written_yet_is_simply_absent(self):
        self.assertIsNone(game_for("blackjack"))


class WalletTests(TestCase):
    """Where coins come from and where they go."""

    def setUp(self):
        self.user = User.objects.create_user(username="hero", password="secret123")

    def test_a_wallet_opens_with_a_starting_balance(self):
        wallet = wallet_for(self.user)
        self.assertEqual(wallet.balance, SIGNUP_COINS)
        self.assertEqual(CoinLedger.objects.filter(user=self.user, reason="signup").count(), 1)

    def test_opening_it_twice_does_not_pay_twice(self):
        wallet_for(self.user)
        wallet_for(self.user)
        self.assertEqual(wallet_for(self.user).balance, SIGNUP_COINS)
        self.assertEqual(CoinLedger.objects.filter(user=self.user, reason="signup").count(), 1)

    def test_spending_more_than_you_have_is_refused_outright(self):
        self.assertIsNone(spend(self.user, SIGNUP_COINS + 1, "stake"))
        self.assertEqual(wallet_for(self.user).balance, SIGNUP_COINS)

    def test_every_movement_leaves_a_row_that_adds_up(self):
        spend(self.user, 100, "stake", memo="player_bet")
        grant(self.user, 250, "payout", memo="player_bet")

        rows = CoinLedger.objects.filter(user=self.user).order_by("id")
        self.assertEqual([row.amount for row in rows], [SIGNUP_COINS, -100, 250])
        self.assertEqual(rows.last().balance_after, wallet_for(self.user).balance)
        self.assertEqual(sum(row.amount for row in rows), wallet_for(self.user).balance)


class DailyCoinsTests(TestCase):
    """The faucet, once a day."""

    def setUp(self):
        self.user = User.objects.create_user(username="hero", password="secret123")

    def test_a_player_who_has_never_claimed_can(self):
        self.assertTrue(can_claim_daily(None))

    def test_claiming_twice_in_a_day_pays_once(self):
        self.assertIsNotNone(claim_daily(self.user))
        self.assertIsNone(claim_daily(self.user))
        self.assertEqual(wallet_for(self.user).balance, SIGNUP_COINS + DAILY_COINS)

    def test_yesterdays_claim_does_not_block_todays(self):
        claim_daily(self.user)
        wallet = wallet_for(self.user)
        wallet.last_claim_at = timezone.now() - timedelta(days=1)
        wallet.save(update_fields=["last_claim_at"])

        self.assertIsNotNone(claim_daily(self.user))
        self.assertEqual(wallet_for(self.user).balance, SIGNUP_COINS + DAILY_COINS * 2)

    def test_a_claim_earlier_today_still_blocks_it(self):
        # A calendar day, not a rolling twenty-four hours: claiming at 23:00
        # must not mean waiting until 23:00 tomorrow.
        self.assertFalse(can_claim_daily(timezone.now() - timedelta(minutes=1)))


class ShopTests(TestCase):
    """Buying a throwable, and what owning one means."""

    def setUp(self):
        self.user = User.objects.create_user(username="hero", password="secret123")

    def test_everybody_owns_the_free_ones(self):
        self.assertTrue(owns_throwable(self.user, "tomato"))

    def test_a_priced_one_has_to_be_bought(self):
        self.assertFalse(owns_throwable(self.user, "bomb"))

        wallet = buy_throwable(self.user, "bomb")

        self.assertEqual(wallet.balance, SIGNUP_COINS - 300)
        self.assertTrue(owns_throwable(self.user, "bomb"))
        self.assertEqual(owned_items(self.user), {unlock_key("bomb")})

    def test_buying_the_same_thing_twice_is_refused(self):
        buy_throwable(self.user, "bomb")
        self.assertEqual(buy_throwable(self.user, "bomb"), "You already have that.")
        self.assertEqual(wallet_for(self.user).balance, SIGNUP_COINS - 300)

    def test_a_purchase_that_cannot_be_afforded_takes_nothing(self):
        spend(self.user, SIGNUP_COINS, "stake")

        self.assertEqual(buy_throwable(self.user, "crown"), "Not enough coins.")
        self.assertFalse(Unlock.objects.filter(user=self.user).exists())
        self.assertEqual(wallet_for(self.user).balance, 0)

    def test_nothing_outside_the_catalogue_can_be_bought(self):
        self.assertEqual(buy_throwable(self.user, "grenade"), "No such thing.")

    def test_the_catalogue_says_what_you_already_have(self):
        buy_throwable(self.user, "bomb")
        by_item = {row["item"]: row for row in catalogue(self.user)}

        self.assertTrue(by_item["tomato"]["owned"])
        self.assertEqual(by_item["tomato"]["price"], 0)
        self.assertTrue(by_item["bomb"]["owned"])
        self.assertFalse(by_item["crown"]["owned"])


class CoinApiTests(APITestCase):
    """The endpoints a client actually talks to."""

    def setUp(self):
        self.user = User.objects.create_user(username="hero", password="secret123")
        self.client.force_authenticate(self.user)

    def test_the_wallet_reports_the_balance_and_the_games(self):
        response = self.client.get(reverse("coin-wallet"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["balance"], SIGNUP_COINS)
        self.assertTrue(response.data["can_claim"])
        self.assertEqual([game["id"] for game in response.data["games"]], ["player_bet"])

    def test_claiming_twice_is_a_refusal_rather_than_a_second_payment(self):
        self.assertEqual(self.client.post(reverse("coin-claim")).status_code, status.HTTP_200_OK)

        second = self.client.post(reverse("coin-claim"))

        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(wallet_for(self.user).balance, SIGNUP_COINS + DAILY_COINS)

    def test_buying_through_the_api_hands_back_the_new_shelf(self):
        response = self.client.post(reverse("coin-buy"), {"item": "banana"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["balance"], SIGNUP_COINS - 100)
        self.assertTrue({row["item"]: row for row in response.data["items"]}["banana"]["owned"])

    def test_a_stranger_gets_nothing(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(reverse("coin-wallet")).status_code, status.HTTP_401_UNAUTHORIZED)
