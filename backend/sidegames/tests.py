import json
from datetime import datetime, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from game.throwables import unlock_key

from . import blackjack, blackjackbank, blackjacktable
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
from .games import BLACKJACK, PLAYER_BET, clean_stake, game_for
from .models import BlackjackRound, CoinLedger, MissionClaim, Unlock, Wallet
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
        # This used to name blackjack, which has since been written. The point
        # of the test is the lookup rather than the example, so it names
        # something nobody has built instead.
        self.assertIsNone(game_for("roulette"))
        self.assertIsNone(game_for(""))


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
        # Both of them, so a client never has to carry its own copy of a stake
        # limit. Order is the order they are declared in, which is the order
        # they were written.
        self.assertEqual(
            [game["id"] for game in response.data["games"]], ["player_bet", "blackjack"],
        )

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


class MissionPeriodTests(TestCase):
    """Which day, and which week, a claim belongs to."""

    def test_a_day_is_a_calendar_day_in_the_server_s_own_timezone(self):
        from .missions import DAILY, period_key, window

        at = timezone.make_aware(datetime(2026, 8, 22, 23, 59, 59))
        start, end = window(DAILY, at)

        self.assertEqual(period_key(DAILY, at), "2026-08-22")
        self.assertEqual(timezone.localtime(start).hour, 0)
        # Ends at the start of the next one rather than at 23:59:59, so a game
        # finishing in the last second of the day belongs to it and to nothing
        # else.
        self.assertEqual((end - start), timedelta(days=1))
        self.assertTrue(start <= at < end)

    def test_a_week_runs_from_monday(self):
        from .missions import WEEKLY, period_key, window

        # A Saturday.
        at = timezone.make_aware(datetime(2026, 8, 22, 12, 0))
        start, end = window(WEEKLY, at)

        self.assertEqual(period_key(WEEKLY, at), "2026-08-17")
        self.assertEqual(timezone.localtime(start).weekday(), 0)
        self.assertEqual(end - start, timedelta(days=7))
        self.assertTrue(start <= at < end)

    def test_monday_and_sunday_are_the_same_week(self):
        from .missions import WEEKLY, period_key

        monday = timezone.make_aware(datetime(2026, 8, 17, 0, 1))
        sunday = timezone.make_aware(datetime(2026, 8, 23, 23, 59))
        next_monday = timezone.make_aware(datetime(2026, 8, 24, 0, 1))

        self.assertEqual(period_key(WEEKLY, monday), period_key(WEEKLY, sunday))
        self.assertNotEqual(period_key(WEEKLY, sunday), period_key(WEEKLY, next_monday))


class MissionCatalogueTests(TestCase):
    """The list itself, before anybody has played anything."""

    def test_every_mission_counts_something_the_tally_actually_reads(self):
        """A mission whose `counts` names a tally nobody produces is a mission
        stuck at zero forever, and it would look exactly like one nobody has
        got round to."""
        from .missions import MISSIONS

        tallies = {
            "games", "wins", "spins", "sitngos", "knockouts", "formats", "big_spin",
            "cash_hands",
        }
        for mission in MISSIONS:
            with self.subTest(mission=mission["key"]):
                self.assertIn(mission["counts"], tallies)
                self.assertGreater(mission["target"], 0)
                self.assertGreater(mission["coins"], 0)

    def test_every_mission_explains_itself_at_length(self):
        """The label says what to do in three words; this is where "what counts"
        is actually answered."""
        from .missions import MISSIONS

        for mission in MISSIONS:
            with self.subTest(mission=mission["key"]):
                self.assertGreater(len(mission["detail"]), 60)
                self.assertNotEqual(mission["detail"], mission["blurb"])

    def test_the_board_carries_the_long_form_too(self):
        from .missionbank import mission_board

        user = User.objects.create_user(username="ms_detail", password="secret123")
        for row in mission_board(user):
            self.assertTrue(row["detail"])

    def test_the_keys_are_unique_because_a_claim_is_filed_under_one(self):
        from .missions import MISSIONS

        keys = [mission["key"] for mission in MISSIONS]
        self.assertEqual(len(keys), len(set(keys)))

    def test_a_week_is_worth_more_than_a_day_but_not_more_than_a_week_of_days(self):
        from .missions import DAILY, MISSIONS, WEEKLY

        day = sum(m["coins"] for m in MISSIONS if m["period"] == DAILY)
        week = sum(m["coins"] for m in MISSIONS if m["period"] == WEEKLY)

        self.assertGreater(week, day)
        self.assertLess(week, day * 7)

    def test_progress_is_capped_at_the_target(self):
        from .missions import BY_KEY, progress_of

        # Six wins is not six of the one win the daily asked for.
        self.assertEqual(progress_of(BY_KEY["daily_win"], {"wins": 6}), 1)
        self.assertEqual(progress_of(BY_KEY["daily_play"], {"games": 2}), 2)
        self.assertEqual(progress_of(BY_KEY["daily_play"], {}), 0)

    def test_an_unknown_key_is_nobody_s_mission(self):
        from .missions import clean_key

        self.assertIsNone(clean_key("daily_free_money"))
        self.assertIsNone(clean_key(None))
        self.assertIsNotNone(clean_key("daily_win"))


class MissionProgressTests(TestCase):
    """Progress read back out of the games themselves."""

    def setUp(self):
        self.user = User.objects.create_user(username="m_player", password="secret123")
        wallet_for(self.user)

    def _game(self, fmt, *, finished_at, multiplier=0, seats=3):
        from tournaments.models import Tournament

        return Tournament.objects.create(
            name=f"{fmt} game", host=self.user, format=fmt, status="finished",
            buy_in_coins=25, buy_in_cents=0, max_players=seats, players_per_table=seats,
            spin_multiplier=multiplier, finished_at=finished_at,
        )

    def _played(self, game, *, finish=2, knockouts=0):
        from tournaments.models import TournamentPlayer

        return TournamentPlayer.objects.create(
            tournament=game, user=self.user, table=game.ensure_table(1),
            seat=0, seat_at_table=0, chips=0,
            finish_position=finish, knockouts=knockouts,
        )

    def test_a_game_counts_in_the_window_it_finished_in(self):
        from .missiontally import counts_for

        now = timezone.now()
        self._played(self._game("spingo", finished_at=now - timedelta(minutes=5)))
        # Yesterday's, which is nobody's business today.
        self._played(self._game("sitngo", finished_at=now - timedelta(days=2)))

        counts = counts_for(self.user, now - timedelta(hours=1), now + timedelta(hours=1))

        self.assertEqual(counts["games"], 1)
        self.assertEqual(counts["spins"], 1)
        self.assertEqual(counts["sitngos"], 0)

    def test_a_tournament_is_not_one_of_these(self):
        """A tournament is an evening, not a thing you do three of. A daily
        that could be finished by sitting at one would be about waiting."""
        from .missiontally import counts_for

        now = timezone.now()
        self._played(self._game("standard", finished_at=now, seats=9))

        self.assertEqual(counts_for(self.user, now - timedelta(hours=1), now + timedelta(hours=1))["games"], 0)

    def test_a_game_still_being_played_counts_for_nothing_yet(self):
        from tournaments.models import Tournament, TournamentPlayer
        from .missiontally import counts_for

        now = timezone.now()
        live = Tournament.objects.create(
            name="live", host=self.user, format="spingo", status="running",
            buy_in_coins=25, max_players=3, players_per_table=3,
        )
        TournamentPlayer.objects.create(
            tournament=live, user=self.user, table=live.ensure_table(1),
            seat=0, seat_at_table=0, chips=1500,
        )

        self.assertEqual(counts_for(self.user, now - timedelta(hours=1), now + timedelta(hours=1))["games"], 0)

    def test_wins_formats_and_the_big_draw_are_all_read_off_the_same_games(self):
        from .missiontally import counts_for

        now = timezone.now()
        self._played(self._game("spingo", finished_at=now, multiplier=10), finish=1)
        self._played(self._game("sitngo", finished_at=now, seats=2), finish=2, knockouts=1)

        counts = counts_for(self.user, now - timedelta(hours=1), now + timedelta(hours=1))

        self.assertEqual(counts["games"], 2)
        self.assertEqual(counts["wins"], 1)
        self.assertEqual(counts["formats"], 2)
        self.assertEqual(counts["best_spin"], 10)
        self.assertEqual(counts["big_spin"], 1)
        self.assertEqual(counts["knockouts"], 1)

    def test_an_ordinary_spin_is_not_a_big_draw(self):
        from .missiontally import counts_for

        now = timezone.now()
        self._played(self._game("spingo", finished_at=now, multiplier=2))

        counts = counts_for(self.user, now - timedelta(hours=1), now + timedelta(hours=1))
        self.assertEqual(counts["big_spin"], 0)

    def test_somebody_else_s_games_are_somebody_else_s(self):
        from .missiontally import counts_for
        from tournaments.models import TournamentPlayer

        now = timezone.now()
        other = User.objects.create_user(username="m_other", password="secret123")
        game = self._game("spingo", finished_at=now)
        TournamentPlayer.objects.create(
            tournament=game, user=other, table=game.ensure_table(1),
            seat=1, seat_at_table=1, chips=0, finish_position=1,
        )

        self.assertEqual(counts_for(self.user, now - timedelta(hours=1), now + timedelta(hours=1))["games"], 0)


class MissionClaimTests(APITestCase):
    """Taking the coins, once."""

    def setUp(self):
        self.user = User.objects.create_user(username="mc_player", password="secret123")
        wallet_for(self.user)
        Wallet.objects.filter(user=self.user).update(balance=0)
        self.client.force_authenticate(self.user)

    def _finish(self, count, fmt="spingo", finish=2, multiplier=0):
        from tournaments.models import Tournament, TournamentPlayer

        for index in range(count):
            game = Tournament.objects.create(
                name=f"g{index}", host=self.user, format=fmt, status="finished",
                buy_in_coins=25, max_players=3, players_per_table=3,
                spin_multiplier=multiplier, finished_at=timezone.now(),
            )
            TournamentPlayer.objects.create(
                tournament=game, user=self.user, table=game.ensure_table(1),
                seat=0, seat_at_table=0, chips=0, finish_position=finish,
            )

    def test_an_unfinished_mission_pays_nothing(self):
        from .missionbank import claim_mission

        self._finish(2)

        self.assertEqual(claim_mission(self.user, "daily_play"), "Not finished yet.")
        self.assertEqual(Wallet.objects.get(user=self.user).balance, 0)

    def test_a_finished_one_pays_its_coins(self):
        from .missionbank import claim_mission
        from .missions import BY_KEY

        self._finish(3)

        wallet, coins = claim_mission(self.user, "daily_play")

        self.assertEqual(coins, BY_KEY["daily_play"]["coins"])
        self.assertEqual(wallet.balance, coins)
        self.assertEqual(Wallet.objects.get(user=self.user).balance, coins)

    def test_it_pays_once_however_many_times_it_is_asked(self):
        from .missionbank import claim_mission

        self._finish(3)
        wallet, coins = claim_mission(self.user, "daily_play")

        for _ in range(5):
            self.assertEqual(claim_mission(self.user, "daily_play"), "Already claimed.")

        self.assertEqual(Wallet.objects.get(user=self.user).balance, coins)
        self.assertEqual(MissionClaim.objects.filter(user=self.user).count(), 1)

    def test_the_coins_are_written_down_where_every_other_coin_is(self):
        from .missionbank import claim_mission

        self._finish(3)
        claim_mission(self.user, "daily_play")

        row = CoinLedger.objects.filter(user=self.user, reason="mission").first()
        self.assertIsNotNone(row)
        self.assertIn("daily_play", row.memo)

    def test_a_mission_nobody_wrote_is_refused(self):
        from .missionbank import claim_mission

        self.assertEqual(claim_mission(self.user, "free_coins"), "No such mission.")

    def test_the_board_says_what_is_done_and_what_has_been_taken(self):
        from .missionbank import claim_mission, mission_board

        self._finish(3, finish=1)
        board = {one["key"]: one for one in mission_board(self.user)}

        self.assertTrue(board["daily_play"]["claimable"])
        self.assertTrue(board["daily_win"]["claimable"])
        # Three Spin n Gos and no Sit n Go: one of each is half done.
        self.assertEqual(board["daily_both"]["progress"], 1)
        self.assertFalse(board["daily_both"]["claimable"])

        claim_mission(self.user, "daily_play")
        after = {one["key"]: one for one in mission_board(self.user)}
        self.assertTrue(after["daily_play"]["claimed"])
        self.assertFalse(after["daily_play"]["claimable"])

    def test_the_endpoint_pays_and_hands_back_the_board_and_the_wallet(self):
        self._finish(3)

        response = self.client.post(
            reverse("coin-mission-claim"), {"key": "daily_play"}, format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["coins"], 60)
        self.assertEqual(response.data["balance"], 60)
        claimed = [one for one in response.data["missions"] if one["key"] == "daily_play"]
        self.assertTrue(claimed[0]["claimed"])

    def test_the_endpoint_refuses_an_unfinished_one_rather_than_paying(self):
        response = self.client.post(
            reverse("coin-mission-claim"), {"key": "weekly_win"}, format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Wallet.objects.get(user=self.user).balance, 0)

    def test_the_board_is_readable_before_anybody_has_played_anything(self):
        from .missions import MISSIONS

        response = self.client.get(reverse("coin-missions"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["missions"]), len(MISSIONS))
        self.assertTrue(all(one["progress"] == 0 for one in response.data["missions"]))
        self.assertFalse(any(one["claimable"] for one in response.data["missions"]))


class BorderShopTests(APITestCase):
    """Rings around a face: bought once, worn everywhere."""

    def setUp(self):
        self.user = User.objects.create_user(username="bd_player", password="secret123")
        wallet_for(self.user)
        Wallet.objects.filter(user=self.user).update(balance=1000)
        self.client.force_authenticate(self.user)

    def test_the_shop_sells_eight_of_them(self):
        from .borders import BORDERS

        rows = [row for row in self.client.get(reverse("coin-shop")).data["items"]
                if row["shelf"] == "border"]

        self.assertEqual(len(rows), len(BORDERS))
        self.assertEqual(len(rows), 8)
        self.assertTrue(all(row["price"] > 0 for row in rows))
        self.assertFalse(any(row["owned"] for row in rows))

    def test_buying_one_takes_the_coins_and_hands_it_over(self):
        from .borders import price_of

        response = self.client.post(
            reverse("coin-buy"), {"item": "gold", "shelf": "border"}, format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["balance"], 1000 - price_of("gold"))
        gold = [row for row in response.data["items"] if row["item"] == "gold"][0]
        self.assertTrue(gold["owned"])

    def test_a_ring_nobody_sells_is_refused(self):
        response = self.client.post(
            reverse("coin-buy"), {"item": "platinum", "shelf": "border"}, format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Wallet.objects.get(user=self.user).balance, 1000)

    def test_you_cannot_wear_one_you_have_not_bought(self):
        """This endpoint is the other way a border id reaches the server, and a
        ring drawn on everybody else's screen is not a client's word to take."""
        response = self.client.patch(
            reverse("coin-wear-border"), {"border": "rainbow"}, format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # Refused before a profile was even made for them, which is the state
        # a brand new account is in.
        from accounts.models import Profile

        self.assertEqual(
            Profile.objects.filter(user=self.user, avatar_border="rainbow").count(), 0,
        )

    def test_buying_it_then_wearing_it(self):
        self.client.post(reverse("coin-buy"), {"item": "silver", "shelf": "border"}, format="json")

        response = self.client.patch(
            reverse("coin-wear-border"), {"border": "silver"}, format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.avatar_border, "silver")

    def test_taking_it_off_again_needs_no_purchase(self):
        self.client.post(reverse("coin-buy"), {"item": "silver", "shelf": "border"}, format="json")
        self.client.patch(reverse("coin-wear-border"), {"border": "silver"}, format="json")

        response = self.client.patch(reverse("coin-wear-border"), {"border": ""}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.avatar_border, "")

    def test_the_same_ring_is_not_sold_twice(self):
        self.client.post(reverse("coin-buy"), {"item": "silver", "shelf": "border"}, format="json")
        before = Wallet.objects.get(user=self.user).balance

        again = self.client.post(
            reverse("coin-buy"), {"item": "silver", "shelf": "border"}, format="json",
        )

        self.assertEqual(again.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Wallet.objects.get(user=self.user).balance, before)

    def test_a_shelf_nobody_stocks_is_refused(self):
        response = self.client.post(
            reverse("coin-buy"), {"item": "gold", "shelf": "yachts"}, format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_an_empty_wallet_buys_nothing(self):
        Wallet.objects.filter(user=self.user).update(balance=10)

        response = self.client.post(
            reverse("coin-buy"), {"item": "rainbow", "shelf": "border"}, format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Wallet.objects.get(user=self.user).balance, 10)

    def test_the_ring_travels_with_the_face(self):
        """Bought once and drawn everywhere: the point of buying one is that
        other people see it."""
        from tournaments.models import Tournament, TournamentPlayer

        self.client.post(reverse("coin-buy"), {"item": "gold", "shelf": "border"}, format="json")
        self.client.patch(reverse("coin-wear-border"), {"border": "gold"}, format="json")

        host = User.objects.create_user(username="bd_host", password="secret123", is_staff=True)
        night = Tournament.objects.create(name="Night", host=host, status="lobby")
        TournamentPlayer.objects.create(
            tournament=night, user=self.user, table=night.ensure_table(1),
            seat=0, seat_at_table=0, chips=1000,
        )

        seats = self.client.get(reverse("tournament-detail", args=[night.id])).data["players"]

        self.assertEqual(seats[0]["avatar_border"], "gold")


class CashMissionTests(TestCase):
    """The cash missions, and the record they are read out of.

    Hands rather than sessions or results. A mission that asked somebody to
    finish a cash session up would be asking them to quit while winning, which
    is bad advice and unreadable besides — a cash game has no end to measure at.
    """

    def setUp(self):
        self.user = User.objects.create_user(username="mission_cash", password="secret123")
        wallet_for(self.user)

    def _deal(self, count, when=None, user=None):
        """`count` hands dealt to somebody at a cash table."""
        from cash.models import CashHand, CashHandSeat, CashTable

        table = CashTable.objects.create(name="Missions", stake="micro", seat_count=6)
        moment = when or timezone.now()
        for number in range(count):
            hand = CashHand.objects.create(table=table, hand_number=number + 1, pot=10)
            CashHandSeat.objects.create(
                hand=hand, user=user or self.user, seat=0, net=-2, won=0, played_at=moment,
            )

    def test_hands_dealt_today_count_towards_the_daily(self):
        from .missions import DAILY, window
        from .missiontally import counts_for

        self._deal(3)

        start, end = window(DAILY)
        self.assertEqual(counts_for(self.user, start, end)["cash_hands"], 3)

    def test_somebody_else_s_hands_are_not_yours(self):
        from .missions import DAILY, window
        from .missiontally import counts_for

        other = User.objects.create_user(username="mission_other", password="secret123")
        self._deal(4, user=other)

        start, end = window(DAILY)
        self.assertEqual(counts_for(self.user, start, end)["cash_hands"], 0)

    def test_a_hand_from_last_week_is_not_this_week_s(self):
        from .missions import WEEKLY, window
        from .missiontally import counts_for

        start, end = window(WEEKLY)
        self._deal(5, when=start - timedelta(hours=1))

        self.assertEqual(counts_for(self.user, start, end)["cash_hands"], 0)

    def test_the_daily_finishes_at_twenty_hands(self):
        from .missions import BY_KEY, progress_of

        mission = BY_KEY["daily_cash"]

        self.assertEqual(progress_of(mission, {"cash_hands": 19}), 19)
        self.assertEqual(progress_of(mission, {"cash_hands": 20}), mission["target"])
        # Capped: a player who sat for two hundred hands has not finished it ten
        # times over.
        self.assertEqual(progress_of(mission, {"cash_hands": 200}), mission["target"])

    def test_the_cash_missions_ask_for_hands_rather_than_winning(self):
        """Whether somebody is up or down must not come into it — a mission
        that pays for winning pays the luckiest player, not the one who
        played."""
        from .missions import BY_KEY

        for key in ("daily_cash", "weekly_cash"):
            with self.subTest(mission=key):
                self.assertEqual(BY_KEY[key]["counts"], "cash_hands")


# ---------------------------------------------------------------------------
# Blackjack.
#
# The rules first, on their own, because that is where a bug costs somebody
# coins: an ace counted as eleven when it had to be one, a blackjack paid after
# a split, a dealer that hit a soft seventeen. Then the round, which is those
# rules against a wallet, and finally the endpoints, which are the round with a
# client on the other end that is not to be trusted about any of it.
# ---------------------------------------------------------------------------

def _stacked(player, dealer, *rest):
    """The whole 52, arranged so that a deal comes out exactly like this.

    In dealing order — player, dealer's up card, player, dealer's hole card —
    and then whatever `rest` says, which is every card drawn after the deal in
    the order it is drawn. The remainder of the deck follows in an order nobody
    should depend on: a test that needs a particular card must name it.
    """
    top = [player[0], dealer[0], player[1], dealer[1], *rest]
    assert len(set(top)) == len(top), "a stacked deck named the same card twice"
    return top + [
        rank + suit
        for rank in blackjack.RANKS for suit in blackjack.SUITS
        if rank + suit not in top
    ]


class _Stacker:
    """A generator that arranges instead of shuffling.

    fresh_deck takes its rng as an argument for exactly this — see spingo, where
    the multiplier draw does the same thing. Nothing is patched and no module
    state is reached into; the test simply says what the deck is.
    """

    def __init__(self, cards):
        self.cards = list(cards)

    def shuffle(self, deck):
        deck[:] = self.cards


class BlackjackArithmeticTests(TestCase):
    """Hand values, and the ace that changes its mind."""

    def test_an_ace_and_a_picture_is_a_soft_twenty_one(self):
        self.assertEqual(blackjack.hand_value(["As", "Kd"]), (21, True))

    def test_two_aces_are_twelve_and_not_twenty_two(self):
        # The one everybody gets wrong first: only one of them can be eleven.
        self.assertEqual(blackjack.hand_value(["As", "Ah"]), (12, True))

    def test_two_aces_and_a_nine_are_twenty_one(self):
        self.assertEqual(blackjack.hand_value(["As", "Ah", "9c"]), (21, True))

    def test_three_aces_and_an_eight_are_twenty_one(self):
        self.assertEqual(blackjack.hand_value(["As", "Ah", "Ad", "8c"]), (21, True))

    def test_an_ace_flips_from_eleven_to_one_when_the_next_card_lands(self):
        self.assertEqual(blackjack.hand_value(["As", "6d"]), (17, True))
        # The same ace, now worth one, and the hand is a hard seventeen rather
        # than a bust.
        self.assertEqual(blackjack.hand_value(["As", "6d", "Kc"]), (17, False))

    def test_the_last_ace_is_demoted_too_when_it_has_to_be(self):
        self.assertEqual(blackjack.hand_value(["As", "Ah", "9c", "Ad"]), (12, False))

    def test_an_ace_is_never_demoted_further_than_it_has_to_be(self):
        # 11 + 1 + 5 is seventeen and soft; demoting the second ace as well
        # would quietly cost the player ten.
        self.assertEqual(blackjack.hand_value(["As", "Ah", "5c"]), (17, True))

    def test_a_hand_with_no_ace_in_it_is_never_soft(self):
        self.assertEqual(blackjack.hand_value(["Ts", "9d"]), (19, False))

    def test_a_hand_can_go_over_twenty_one_with_an_ace_in_it(self):
        self.assertTrue(blackjack.is_bust(["Ts", "9d", "Ac", "5h"]))

    def test_an_ace_saves_a_hand_that_would_otherwise_be_bust(self):
        self.assertFalse(blackjack.is_bust(["As", "9d", "5c"]))
        self.assertEqual(blackjack.hand_value(["As", "9d", "5c"]), (15, False))

    def test_a_picture_is_ten_and_a_ten_is_ten(self):
        for card in ("Ts", "Jh", "Qd", "Kc"):
            with self.subTest(card=card):
                self.assertEqual(blackjack.card_value(card), 10)


class BlackjackNaturalTests(TestCase):
    """What counts as a blackjack, and what it pays."""

    def test_an_ace_and_a_ten_card_on_the_first_two_is_a_blackjack(self):
        self.assertTrue(blackjack.is_blackjack(["As", "Th"]))
        self.assertTrue(blackjack.is_blackjack(["Kd", "Ac"]))

    def test_twenty_one_out_of_three_cards_is_not_one(self):
        self.assertFalse(blackjack.is_blackjack(["7s", "7h", "7d"]))

    def test_twenty_one_out_of_a_split_is_not_one_either(self):
        # The rule that pays for itself: an ace split into two ten-cards is two
        # twenty-ones, and paying 3:2 on both would be paying for hands nobody
        # was dealt.
        self.assertFalse(blackjack.is_blackjack(["As", "Th"], from_split=True))
        self.assertFalse(blackjack.is_natural(blackjack.new_hand(["As", "Th"], 25, from_split=True)))

    def test_a_blackjack_pays_three_for_two_on_top_of_the_stake(self):
        self.assertEqual(blackjack.returns_for("blackjack", 25), 62)
        self.assertEqual(blackjack.returns_for("blackjack", 100), 250)

    def test_an_odd_stake_rounds_down_rather_than_up(self):
        # 5 pays 7.5, and the house keeps the halfpenny — see BLACKJACK_PAYS.
        self.assertEqual(blackjack.returns_for("blackjack", 5), 12)

    def test_an_ordinary_win_pays_even_money(self):
        self.assertEqual(blackjack.returns_for("win", 25), 50)

    def test_a_push_returns_the_stake_exactly(self):
        self.assertEqual(blackjack.returns_for("push", 25), 25)

    def test_a_loss_returns_nothing_at_all(self):
        self.assertEqual(blackjack.returns_for("lose", 25), 0)


class BlackjackDealerTests(TestCase):
    """The dealer has no choices. These are them."""

    def test_the_dealer_stands_on_a_soft_seventeen(self):
        self.assertFalse(blackjack.dealer_should_hit(["Ah", "6d"]))

    def test_the_dealer_hits_a_hard_sixteen(self):
        self.assertTrue(blackjack.dealer_should_hit(["Ts", "6d"]))

    def test_the_dealer_hits_a_soft_sixteen(self):
        self.assertTrue(blackjack.dealer_should_hit(["Ah", "5d"]))

    def test_the_dealer_stands_on_a_hard_seventeen_too(self):
        self.assertFalse(blackjack.dealer_should_hit(["Ts", "7d"]))

    def test_the_dealer_draws_until_the_policy_stops_it(self):
        deck = ["5c", "Kd"]
        cards = ["6h", "6s"]

        blackjack.play_dealer(cards, deck)

        self.assertEqual(cards, ["6h", "6s", "5c"])
        # Stopped at seventeen and left the king where it was.
        self.assertEqual(deck, ["Kd"])

    def test_the_dealer_does_not_draw_against_a_table_of_busts(self):
        bust = blackjack.new_hand(["Ts", "9d", "5c"], 25)
        self.assertFalse(blackjack.dealer_must_play([bust]))

    def test_the_dealer_does_not_draw_against_a_natural(self):
        self.assertFalse(blackjack.dealer_must_play([blackjack.new_hand(["As", "Kd"], 25)]))

    def test_the_dealer_draws_when_one_of_two_hands_is_still_alive(self):
        hands = [
            blackjack.new_hand(["Ts", "9d", "5c"], 25),
            blackjack.new_hand(["9h", "8s"], 25),
        ]
        self.assertTrue(blackjack.dealer_must_play(hands))


class BlackjackActionTests(TestCase):
    """The `can` object: the server's word on what is legal."""

    def test_a_pair_of_kings_can_be_split(self):
        hands = [blackjack.new_hand(["Kd", "Kh"], 25)]
        self.assertTrue(blackjack.actions_for(hands, 0, 0)["split"])

    def test_a_king_and_a_queen_can_too(self):
        # Two tens is a pair, whatever is printed on them — the rule every
        # casino plays. Breaking a twenty is a bad play and it is the player's
        # to make.
        for pair in (["Kd", "Qh"], ["Kd", "Th"], ["Jc", "Qs"]):
            with self.subTest(pair=pair):
                hands = [blackjack.new_hand(pair, 25)]
                self.assertTrue(blackjack.actions_for(hands, 0, 0)["split"])

    def test_two_aces_are_a_pair_and_an_ace_and_a_ten_are_not(self):
        # Every ace counts as eleven, so they match each other and nothing else.
        self.assertTrue(
            blackjack.actions_for([blackjack.new_hand(["As", "Ah"], 25)], 0, 0)["split"],
        )
        self.assertFalse(
            blackjack.actions_for([blackjack.new_hand(["As", "Kh"], 25)], 0, 0)["split"],
        )

    def test_unequal_values_do_not_split(self):
        hands = [blackjack.new_hand(["9d", "8h"], 25)]
        self.assertFalse(blackjack.actions_for(hands, 0, 0)["split"])

    def test_any_two_cards_can_be_doubled(self):
        hands = [blackjack.new_hand(["9d", "3h"], 25)]
        self.assertTrue(blackjack.actions_for(hands, 0, 0)["double"])

    def test_a_hand_that_has_been_hit_can_no_longer_double_or_split(self):
        hands = [blackjack.new_hand(["8d", "8h", "2c"], 25)]
        can = blackjack.actions_for(hands, 0, 0)

        self.assertTrue(can["hit"])
        self.assertTrue(can["stand"])
        self.assertFalse(can["double"])
        self.assertFalse(can["split"])

    def test_two_hands_are_the_most_there_will_ever_be(self):
        hands = [
            blackjack.new_hand(["8d", "8h"], 25, from_split=True),
            blackjack.new_hand(["8c", "8s"], 25, from_split=True),
        ]
        self.assertFalse(blackjack.actions_for(hands, 0, 0)["split"])

    def test_a_hand_that_is_not_the_active_one_can_do_nothing(self):
        hands = [
            blackjack.new_hand(["8d", "3h"], 25, from_split=True),
            blackjack.new_hand(["8c", "3s"], 25, from_split=True),
        ]
        self.assertEqual(blackjack.actions_for(hands, 1, 0), blackjack.NO_ACTIONS)

    def test_a_finished_hand_can_do_nothing(self):
        hand = blackjack.new_hand(["Kd", "9h"], 25)
        hand["status"] = blackjack.STOOD
        self.assertEqual(blackjack.actions_for([hand], 0, 0), blackjack.NO_ACTIONS)

    def test_a_hand_that_reaches_twenty_one_has_nothing_left_to_decide(self):
        self.assertEqual(blackjack.status_after_card(["7s", "9d", "5c"]), blackjack.STOOD)
        self.assertEqual(blackjack.status_after_card(["7s", "9d", "6c"]), blackjack.BUST)
        self.assertEqual(blackjack.status_after_card(["7s", "9d", "2c"]), blackjack.PLAYING)

    def test_a_doubled_hand_is_over_whatever_it_came_to(self):
        self.assertEqual(
            blackjack.status_after_card(["5s", "6d", "2c"], one_card_only=True),
            blackjack.STOOD,
        )


class BlackjackSettlementTests(TestCase):
    """Who won, and what comes back."""

    def _hand(self, cards, stake=25, from_split=False):
        return blackjack.new_hand(cards, stake, from_split=from_split)

    def test_a_bust_hand_loses_even_when_the_dealer_busts_too(self):
        """The whole house edge, in one clause: the player acts first, and a
        hand that busted is lost before the dealer has turned a card."""
        result = blackjack.settle([self._hand(["Ts", "9d", "5c"])], ["Kd", "8h", "9s"])

        self.assertEqual(result[0]["outcome"], "lose")
        self.assertEqual(result[0]["returned"], 0)

    def test_a_dealer_blackjack_beats_a_player_twenty_one(self):
        result = blackjack.settle([self._hand(["7s", "7h", "7d"])], ["Ad", "Kh"])

        self.assertEqual(result[0]["outcome"], "lose")

    def test_two_blackjacks_push(self):
        result = blackjack.settle([self._hand(["As", "Kc"])], ["Ad", "Kh"])

        self.assertEqual(result[0]["outcome"], "push")
        self.assertEqual(result[0]["returned"], 25)

    def test_a_blackjack_against_an_ordinary_dealer_hand_pays_three_for_two(self):
        result = blackjack.settle([self._hand(["As", "Kc"])], ["Td", "9h"])

        self.assertEqual(result[0]["outcome"], "blackjack")
        self.assertEqual(result[0]["returned"], 62)

    def test_twenty_one_after_a_split_is_paid_as_an_ordinary_win(self):
        result = blackjack.settle([self._hand(["As", "Kc"], from_split=True)], ["Td", "9h"])

        self.assertEqual(result[0]["outcome"], "win")
        self.assertEqual(result[0]["returned"], 50)

    def test_the_higher_hand_wins(self):
        self.assertEqual(
            blackjack.settle([self._hand(["Ts", "9d"])], ["Td", "8h"])[0]["outcome"], "win",
        )

    def test_an_equal_hand_pushes_and_gets_the_stake_back(self):
        result = blackjack.settle([self._hand(["Ts", "9d"])], ["Td", "9h"])

        self.assertEqual(result[0]["outcome"], "push")
        self.assertEqual(result[0]["returned"], 25)

    def test_a_dealer_bust_pays_every_hand_still_standing(self):
        hands = [self._hand(["Ts", "4d"]), self._hand(["9h", "9s"])]

        result = blackjack.settle(hands, ["Td", "8h", "9c"])

        self.assertEqual([one["outcome"] for one in result], ["win", "win"])

    def test_a_doubled_hand_wins_and_loses_the_doubled_figure(self):
        won = blackjack.settle([self._hand(["5s", "6d", "Th"], stake=50)], ["Td", "8h"])
        self.assertEqual(won[0]["returned"], 100)


class BlackjackRoundTests(TestCase):
    """The rules against a wallet: what a round costs and what it pays."""

    def setUp(self):
        self.user = User.objects.create_user(username="bj_hero", password="secret123")
        wallet_for(self.user)

    def _deal(self, player, dealer, *rest, stake=25):
        return blackjackbank.deal(
            self.user, stake, rng=_Stacker(_stacked(player, dealer, *rest)),
        )

    def _balance(self):
        return wallet_for(self.user).balance

    # -- the wallet, end to end -------------------------------------------

    def test_a_win_takes_the_stake_and_pays_two(self):
        self._deal(("9s", "9d"), ("Ts", "7h"))
        self.assertEqual(self._balance(), SIGNUP_COINS - 25)

        round_ = blackjackbank.stand(self.user)

        self.assertEqual(round_.hands[0]["outcome"], "win")
        self.assertEqual(round_.net, 25)
        self.assertEqual(self._balance(), SIGNUP_COINS + 25)

    def test_a_loss_takes_the_stake_and_pays_nothing(self):
        self._deal(("9s", "9d"), ("Ts", "9h"))

        round_ = blackjackbank.stand(self.user)

        self.assertEqual(round_.hands[0]["outcome"], "lose")
        self.assertEqual(round_.hands[0]["returned"], 0)
        self.assertEqual(round_.net, -25)
        self.assertEqual(self._balance(), SIGNUP_COINS - 25)

    def test_a_push_leaves_the_wallet_exactly_where_it_started(self):
        self._deal(("9s", "9d"), ("Ts", "8h"))

        round_ = blackjackbank.stand(self.user)

        self.assertEqual(round_.hands[0]["outcome"], "push")
        self.assertEqual(round_.net, 0)
        self.assertEqual(self._balance(), SIGNUP_COINS)

    def test_a_blackjack_pays_three_for_two_and_ends_the_round_on_the_deal(self):
        round_ = self._deal(("As", "Kd"), ("9s", "7h"))

        self.assertEqual(round_.status, "finished")
        self.assertIsNone(round_.active)
        self.assertEqual(round_.hands[0]["status"], "blackjack")
        self.assertEqual(round_.hands[0]["outcome"], "blackjack")
        self.assertEqual(round_.net, 37)
        self.assertEqual(self._balance(), SIGNUP_COINS + 37)
        # And the dealer was not asked to draw for a hand that was already paid.
        self.assertEqual(round_.dealer, ["9s", "7h"])

    def test_a_dealer_blackjack_ends_the_round_before_the_player_can_act(self):
        """The peek. Without it a player doubles or splits into a hand that was
        lost before they touched it, and pays a second stake for the privilege."""
        round_ = self._deal(("9s", "9d"), ("Ah", "Kc"))

        self.assertEqual(round_.status, "finished")
        self.assertEqual(round_.hands[0]["outcome"], "lose")
        self.assertEqual(self._balance(), SIGNUP_COINS - 25)
        self.assertEqual(blackjackbank.hit(self.user), "There is no round to play.")

    def test_two_blackjacks_push_on_the_deal(self):
        round_ = self._deal(("As", "Kd"), ("Ah", "Kc"))

        self.assertEqual(round_.hands[0]["outcome"], "push")
        self.assertEqual(self._balance(), SIGNUP_COINS)

    # -- hitting ------------------------------------------------------------

    def test_a_hit_takes_one_card_off_the_top_of_the_deck(self):
        self._deal(("2s", "3d"), ("Ts", "7h"), "4c")

        round_ = blackjackbank.hit(self.user)

        self.assertEqual(round_.hands[0]["cards"], ["2s", "3d", "4c"])
        self.assertEqual(round_.hands[0]["status"], "playing")
        self.assertEqual(round_.status, "playing")
        # 52 less the four dealt and the one hit.
        self.assertEqual(len(round_.deck), 47)

    def test_hitting_into_a_bust_ends_the_round_and_the_dealer_stays_put(self):
        self._deal(("Ts", "6d"), ("9s", "7h"), "Kc")

        round_ = blackjackbank.hit(self.user)

        self.assertEqual(round_.hands[0]["status"], "bust")
        self.assertEqual(round_.hands[0]["outcome"], "lose")
        self.assertEqual(round_.status, "finished")
        self.assertEqual(round_.dealer, ["9s", "7h"])
        self.assertEqual(self._balance(), SIGNUP_COINS - 25)

    def test_hitting_into_twenty_one_stands_the_hand_rather_than_offering_more(self):
        self._deal(("Ts", "6d"), ("9s", "7h"), "5c", "Kh")

        round_ = blackjackbank.hit(self.user)

        self.assertEqual(round_.hands[0]["status"], "stood")
        # And the round went straight to the dealer, who drew to a bust.
        self.assertEqual(round_.dealer, ["9s", "7h", "Kh"])
        self.assertEqual(round_.hands[0]["outcome"], "win")
        self.assertEqual(self._balance(), SIGNUP_COINS + 25)

    def test_a_finished_hand_cannot_be_hit(self):
        self._deal(("9s", "9d"), ("Ts", "7h"))
        blackjackbank.stand(self.user)

        self.assertEqual(blackjackbank.hit(self.user), "There is no round to play.")
        self.assertEqual(blackjackbank.stand(self.user), "There is no round to play.")

    # -- doubling -----------------------------------------------------------

    def test_a_double_takes_a_second_stake_and_exactly_one_card(self):
        self._deal(("5s", "6d"), ("9s", "7h"), "Th", "2c")

        round_ = blackjackbank.double(self.user)

        hand = round_.hands[0]
        self.assertTrue(hand["doubled"])
        self.assertEqual(hand["stake"], 50)
        self.assertEqual(hand["cards"], ["5s", "6d", "Th"])
        self.assertEqual(hand["status"], "stood")
        # Dealer drew to eighteen against a twenty-one.
        self.assertEqual(round_.dealer, ["9s", "7h", "2c"])
        self.assertEqual(hand["returned"], 100)
        self.assertEqual(round_.net, 50)
        self.assertEqual(self._balance(), SIGNUP_COINS + 50)

    def test_a_double_that_busts_loses_both_stakes(self):
        self._deal(("Ts", "6d"), ("9s", "7h"), "Kc")

        round_ = blackjackbank.double(self.user)

        self.assertEqual(round_.hands[0]["status"], "bust")
        self.assertEqual(round_.net, -50)
        self.assertEqual(self._balance(), SIGNUP_COINS - 50)

    def test_a_doubled_hand_stands_even_on_a_twelve(self):
        # That is what doubling buys: one card, whatever it is.
        self._deal(("5s", "6d"), ("9s", "7h"), "Ac", "5h")

        round_ = blackjackbank.double(self.user)

        self.assertEqual(blackjack.hand_value(round_.hands[0]["cards"]), (12, False))
        self.assertEqual(round_.hands[0]["status"], "stood")

    def test_a_double_cannot_be_afforded_out_of_an_empty_wallet(self):
        spend(self.user, SIGNUP_COINS - 25, "stake")
        self._deal(("5s", "6d"), ("9s", "7h"), "Th")

        self.assertEqual(blackjackbank.double(self.user), "Not enough coins to double.")
        self.assertEqual(self._balance(), 0)
        # And the hand is untouched: no card was dealt for a stake nobody paid.
        self.assertEqual(blackjackbank.open_round(self.user).hands[0]["cards"], ["5s", "6d"])

    def test_a_hand_that_has_been_hit_cannot_be_doubled(self):
        self._deal(("2s", "3d"), ("Ts", "7h"), "4c")
        blackjackbank.hit(self.user)

        self.assertEqual(blackjackbank.double(self.user), "You cannot double that hand.")

    # -- splitting ----------------------------------------------------------

    def test_a_pair_splits_into_two_hands_each_with_its_own_stake(self):
        self._deal(("8s", "8d"), ("Ts", "7h"), "Kc", "Kh")

        round_ = blackjackbank.split(self.user)

        self.assertEqual([hand["cards"] for hand in round_.hands], [["8s", "Kc"], ["8d", "Kh"]])
        self.assertEqual([hand["stake"] for hand in round_.hands], [25, 25])
        self.assertTrue(all(hand["from_split"] for hand in round_.hands))
        self.assertEqual(round_.active, 0)
        # Two stakes off the wallet, one per hand.
        self.assertEqual(self._balance(), SIGNUP_COINS - 50)

    def test_both_split_hands_are_played_and_settled_in_turn(self):
        self._deal(("8s", "8d"), ("Ts", "7h"), "Kc", "Kh")
        blackjackbank.split(self.user)

        after_first = blackjackbank.stand(self.user)
        self.assertEqual(after_first.active, 1)
        self.assertEqual(after_first.status, "playing")

        round_ = blackjackbank.stand(self.user)

        self.assertEqual([hand["outcome"] for hand in round_.hands], ["win", "win"])
        self.assertEqual(round_.net, 50)
        self.assertEqual(self._balance(), SIGNUP_COINS + 50)

    def test_only_an_equal_value_splits(self):
        # Nine and eight is seventeen and nothing like a pair. A king and a
        # queen would go through here; see the `can` tests above.
        self._deal(("9d", "8s"), ("Ts", "7h"))

        self.assertEqual(blackjackbank.split(self.user), "You cannot split that hand.")
        self.assertEqual(self._balance(), SIGNUP_COINS - 25)

    def test_two_pictures_split_into_two_hands(self):
        self._deal(("Kd", "Qs"), ("Ts", "7h"), "9c", "8h")

        round_ = blackjackbank.split(self.user)

        self.assertNotIsInstance(round_, str)
        self.assertEqual(len(round_.hands), 2)
        self.assertEqual([hand["cards"][0] for hand in round_.hands], ["Kd", "Qs"])
        # A second stake left the wallet with the second hand.
        self.assertEqual(self._balance(), SIGNUP_COINS - 50)

    def test_a_split_hand_cannot_be_split_again(self):
        self._deal(("8s", "8d"), ("Ts", "7h"), "8c", "Kh")
        blackjackbank.split(self.user)

        # The first hand is a pair of eights all over again, and the answer is
        # still no: two hands is the maximum.
        self.assertEqual(blackjackbank.split(self.user), "You cannot split that hand.")
        self.assertEqual(self._balance(), SIGNUP_COINS - 50)

    def test_split_aces_take_one_card_each_and_cannot_be_hit(self):
        self._deal(("As", "Ah"), ("9s", "7h"), "Kc", "Kd", "3h")

        round_ = blackjackbank.split(self.user)

        self.assertEqual([hand["cards"] for hand in round_.hands], [["As", "Kc"], ["Ah", "Kd"]])
        self.assertEqual([hand["status"] for hand in round_.hands], ["stood", "stood"])
        # Both hands were done at once, so the round went to the dealer without
        # ever offering a button.
        self.assertEqual(round_.status, "finished")
        self.assertEqual(blackjackbank.hit(self.user), "There is no round to play.")

    def test_twenty_one_from_split_aces_is_a_win_and_not_a_blackjack(self):
        self._deal(("As", "Ah"), ("9s", "7h"), "Kc", "Kd", "3h")

        round_ = blackjackbank.split(self.user)

        self.assertEqual([hand["outcome"] for hand in round_.hands], ["win", "win"])
        # 50 back on each rather than 62: see is_blackjack.
        self.assertEqual([hand["returned"] for hand in round_.hands], [50, 50])
        self.assertEqual(round_.net, 50)

    def test_a_split_at_the_table_maximum_costs_two_maximums(self):
        grant(self.user, 500, "payout")
        self._deal(("8s", "8d"), ("Ts", "7h"), "Kc", "Kh", stake=500)
        self.assertEqual(self._balance(), 500)

        blackjackbank.split(self.user)

        self.assertEqual(self._balance(), 0)

    def test_a_split_that_cannot_be_paid_for_is_refused(self):
        self._deal(("8s", "8d"), ("Ts", "7h"), "Kc", "Kh", stake=500)
        self.assertEqual(self._balance(), 0)

        self.assertEqual(blackjackbank.split(self.user), "Not enough coins to split.")
        # One hand, untouched, and no cards drawn for it.
        self.assertEqual(len(blackjackbank.open_round(self.user).hands), 1)

    # -- the guards ---------------------------------------------------------

    def test_a_stake_outside_the_limits_is_refused(self):
        self.assertIn("between", blackjackbank.deal(self.user, 1000))
        self.assertIn("between", blackjackbank.deal(self.user, 1))
        self.assertIn("between", blackjackbank.deal(self.user, "lots"))
        self.assertEqual(self._balance(), SIGNUP_COINS)
        self.assertFalse(BlackjackRound.objects.exists())

    def test_a_deal_nobody_can_pay_for_is_refused_and_writes_nothing(self):
        spend(self.user, SIGNUP_COINS, "stake")

        self.assertEqual(blackjackbank.deal(self.user, 25), "Not enough coins.")
        self.assertEqual(self._balance(), 0)
        self.assertFalse(BlackjackRound.objects.exists())

    def test_a_second_round_cannot_be_dealt_while_one_is_open(self):
        first = self._deal(("9s", "9d"), ("Ts", "7h"))

        self.assertEqual(
            blackjackbank.deal(self.user, 25), "Finish the round you are already playing.",
        )
        self.assertEqual(BlackjackRound.objects.count(), 1)
        # And nothing was charged for the refusal.
        self.assertEqual(self._balance(), SIGNUP_COINS - 25)
        self.assertEqual(blackjackbank.open_round(self.user).id, first.id)

    def test_the_database_itself_refuses_a_second_open_round(self):
        """The check inside deal() is the polite answer. This is the guard: two
        taps arriving together both look first and both find nothing open, and
        select_for_update cannot lock a row neither of them has written yet — so
        what decides is the constraint on the table."""
        self._deal(("9s", "9d"), ("Ts", "7h"))

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                BlackjackRound.objects.create(user=self.user, stake=25, status="playing")

    def test_the_constraint_counts_only_the_unfinished_ones(self):
        # A player who has played all evening has a table full of finished
        # rounds, and none of them may stand in the way of the next deal.
        for _ in range(3):
            BlackjackRound.objects.create(user=self.user, stake=25, status="finished")

        self.assertNotIsInstance(self._deal(("9s", "9d"), ("Ts", "7h")), str)

    def test_a_finished_round_does_not_block_the_next_one(self):
        self._deal(("9s", "9d"), ("Ts", "7h"))
        blackjackbank.stand(self.user)

        second = self._deal(("2s", "3d"), ("Ts", "7h"))

        self.assertNotIsInstance(second, str)
        self.assertEqual(BlackjackRound.objects.count(), 2)

    def test_nobody_can_act_on_somebody_else_s_round(self):
        """There is no round id on the wire at all — every endpoint acts on the
        caller's own open round — so this is the shape of the protection rather
        than a check that could be forgotten."""
        self._deal(("9s", "9d"), ("Ts", "7h"))
        stranger = User.objects.create_user(username="bj_stranger", password="secret123")
        wallet_for(stranger)

        self.assertEqual(blackjackbank.hit(stranger), "There is no round to play.")
        self.assertEqual(blackjackbank.stand(stranger), "There is no round to play.")
        self.assertEqual(len(blackjackbank.open_round(self.user).hands[0]["cards"]), 2)
        self.assertEqual(wallet_for(stranger).balance, SIGNUP_COINS)

    def test_settling_twice_does_not_mint_coins(self):
        self._deal(("9s", "9d"), ("Ts", "7h"))
        round_ = blackjackbank.stand(self.user)
        after = self._balance()

        # The row lock makes this unreachable in practice; the memo is what
        # would catch it if it ever were. See coinbank.settle_tournament_coins.
        self.assertEqual(blackjackbank._pay(round_), 0)
        self.assertEqual(self._balance(), after)
        self.assertEqual(
            CoinLedger.objects.filter(
                user=self.user, reason="payout", memo=f"blackjack:{round_.id}",
            ).count(),
            1,
        )

    def test_every_coin_move_is_memoed_with_the_round_it_belongs_to(self):
        self._deal(("5s", "6d"), ("9s", "7h"), "Th", "2c")
        round_ = blackjackbank.double(self.user)

        rows = CoinLedger.objects.filter(user=self.user, memo=f"blackjack:{round_.id}")

        self.assertEqual(sorted(row.amount for row in rows), [-25, -25, 100])
        self.assertEqual(
            sorted(row.reason for row in rows), ["payout", "stake", "stake"],
        )

    def test_the_ledger_and_the_net_agree_about_what_happened(self):
        self._deal(("9s", "9d"), ("Ts", "7h"))
        round_ = blackjackbank.stand(self.user)

        moved = sum(
            row.amount for row in
            CoinLedger.objects.filter(user=self.user, memo=f"blackjack:{round_.id}")
        )
        self.assertEqual(moved, round_.net)


class BlackjackApiTests(APITestCase):
    """The endpoints, and what they refuse to say."""

    def setUp(self):
        self.user = User.objects.create_user(username="bj_api", password="secret123")
        self.client.force_authenticate(self.user)
        wallet_for(self.user)

    def _fixed(self, player, dealer, *rest):
        """Pin the deck for one request, from outside the round machinery."""
        cards = _stacked(player, dealer, *rest)
        return mock.patch.object(blackjack, "fresh_deck", lambda rng=None: list(cards))

    def test_the_last_ten_hands_come_back_with_every_answer(self):
        """The strip under the table: what each of the last hands came to."""
        # A blackjack, a plain win, a loss and a push, in that order.
        with self._fixed(("As", "Kd"), ("9h", "7c")):
            self.client.post(reverse("blackjack-deal"), {"stake": 25}, format="json")
        with self._fixed(("Ts", "9d"), ("9h", "7c"), "Kc"):
            self.client.post(reverse("blackjack-deal"), {"stake": 25}, format="json")
            self.client.post(reverse("blackjack-stand"))
        with self._fixed(("Ts", "6d"), ("Th", "9c")):
            self.client.post(reverse("blackjack-deal"), {"stake": 25}, format="json")
            self.client.post(reverse("blackjack-stand"))
        with self._fixed(("Ts", "9d"), ("Th", "9c")):
            self.client.post(reverse("blackjack-deal"), {"stake": 25}, format="json")
            response = self.client.post(reverse("blackjack-stand"))

        # Newest first, so the hand just played is the one at the front.
        self.assertEqual(
            [row["result"] for row in response.data["history"]],
            ["push", "lose", "win", "blackjack"],
        )
        # And what each of them moved, which is what the strip is really about.
        self.assertEqual([row["net"] for row in response.data["history"]], [0, -25, 25, 37])

    def test_the_strip_is_there_before_a_hand_is_dealt(self):
        """Somebody who closed the tab comes back to their own last ten."""
        with self._fixed(("Ts", "9d"), ("9h", "7c"), "Kc"):
            self.client.post(reverse("blackjack-deal"), {"stake": 25}, format="json")
            self.client.post(reverse("blackjack-stand"))

        response = self.client.get(reverse("blackjack-round"))

        self.assertIsNone(response.data["round"])
        self.assertEqual([row["result"] for row in response.data["history"]], ["win"])

    def test_the_strip_stops_at_ten(self):
        for _ in range(12):
            with self._fixed(("Ts", "9d"), ("Th", "9c")):
                self.client.post(reverse("blackjack-deal"), {"stake": 5}, format="json")
                response = self.client.post(reverse("blackjack-stand"))

        self.assertEqual(len(response.data["history"]), 10)

    def test_the_strip_reads_the_wallet_rather_than_the_hands(self):
        """A split where one hand won and one lost moved nothing: that is a push.

        Tested on the rule itself rather than through a stacked deck, because
        the deck would have to be arranged to produce it and the arrangement is
        not the thing under test. Calling a round a win because half of it won
        would put a row on the strip that disagrees with the balance above it.
        """
        from .blackjack_views import _result_of
        from .models import BlackjackRound

        def round_with(outcomes, net):
            return BlackjackRound(
                user=self.user, stake=25, net=net,
                hands=[{"outcome": outcome} for outcome in outcomes],
            )

        self.assertEqual(_result_of(round_with(["win", "lose"], 0)), "push")
        self.assertEqual(_result_of(round_with(["win", "win"], 50)), "win")
        self.assertEqual(_result_of(round_with(["win", "lose"], -25)), "lose")
        # A natural is impossible after a split, so it is never one of several —
        # and it is its own answer whatever the figure beside it.
        self.assertEqual(_result_of(round_with(["blackjack"], 37)), "blackjack")

    def test_a_stranger_gets_nothing(self):
        self.client.force_authenticate(None)
        self.assertEqual(
            self.client.get(reverse("blackjack-round")).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_no_round_is_an_answer_rather_than_an_error(self):
        response = self.client.get(reverse("blackjack-round"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["round"])
        self.assertEqual(response.data["balance"], SIGNUP_COINS)

    def test_a_deal_comes_back_in_the_shape_the_contract_promises(self):
        with self._fixed(("9s", "2h"), ("Kd", "7c")):
            response = self.client.post(reverse("blackjack-deal"), {"stake": 25}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        round_ = response.data["round"]
        self.assertEqual(response.data["balance"], SIGNUP_COINS - 25)
        self.assertEqual(round_["stake"], 25)
        self.assertEqual(round_["status"], "playing")
        self.assertEqual(round_["active"], 0)
        self.assertEqual(round_["net"], 0)

        hand = round_["hands"][0]
        self.assertEqual(hand["cards"], ["9s", "2h"])
        self.assertEqual((hand["total"], hand["soft"]), (11, False))
        self.assertEqual(hand["stake"], 25)
        self.assertFalse(hand["doubled"])
        self.assertFalse(hand["from_split"])
        self.assertEqual(hand["status"], "playing")
        self.assertIsNone(hand["outcome"])
        self.assertEqual(hand["returned"], 0)
        self.assertEqual(
            hand["can"], {"hit": True, "stand": True, "double": True, "split": False},
        )

    def test_the_hole_card_and_the_deck_never_reach_the_client(self):
        """The one thing this game must not do. The dealer's second card and
        every undealt card stay on the server until the round is over."""
        with self._fixed(("9s", "2h"), ("Kd", "7c"), "5d"):
            response = self.client.post(reverse("blackjack-deal"), {"stake": 25}, format="json")

        dealer = response.data["round"]["dealer"]
        self.assertEqual(dealer["cards"], ["Kd", "??"])
        # The total is of what is face up. Sending the true total would give the
        # hole card away by subtraction.
        self.assertEqual(dealer["total"], 10)
        self.assertFalse(dealer["soft"])
        self.assertFalse(dealer["blackjack"])

        wire = json.dumps(response.data)
        self.assertNotIn("7c", wire)
        self.assertNotIn("5d", wire)
        self.assertNotIn("deck", wire)

    def test_the_hole_card_is_shown_once_the_round_is_over(self):
        with self._fixed(("9s", "2h"), ("Kd", "7c"), "8s"):
            self.client.post(reverse("blackjack-deal"), {"stake": 25}, format="json")

        response = self.client.post(reverse("blackjack-stand"))

        self.assertEqual(response.data["round"]["dealer"]["cards"], ["Kd", "7c"])
        self.assertEqual(response.data["round"]["dealer"]["total"], 17)
        self.assertIsNone(response.data["round"]["active"])
        self.assertEqual(response.data["round"]["hands"][0]["outcome"], "lose")
        self.assertEqual(response.data["balance"], SIGNUP_COINS - 25)

    def test_a_finished_round_is_not_handed_back_on_the_next_load(self):
        with self._fixed(("9s", "2h"), ("Kd", "7c")):
            self.client.post(reverse("blackjack-deal"), {"stake": 25}, format="json")
        self.client.post(reverse("blackjack-stand"))

        self.assertIsNone(self.client.get(reverse("blackjack-round")).data["round"])

    def test_a_second_deal_is_refused_and_hands_back_the_round_in_play(self):
        with self._fixed(("9s", "2h"), ("Kd", "7c")):
            first = self.client.post(reverse("blackjack-deal"), {"stake": 25}, format="json")

        second = self.client.post(reverse("blackjack-deal"), {"stake": 25}, format="json")

        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("error", second.data)
        # The refusal still draws the table, because the reason for it is that
        # there is already a table.
        self.assertEqual(second.data["round"]["id"], first.data["round"]["id"])
        self.assertEqual(second.data["balance"], SIGNUP_COINS - 25)

    def test_an_action_the_rules_do_not_allow_is_refused(self):
        # Nine and seven: not a pair by rank or by value, so Split is the one
        # action the rules refuse on it.
        with self._fixed(("9d", "7s"), ("9h", "7c")):
            self.client.post(reverse("blackjack-deal"), {"stake": 25}, format="json")

        response = self.client.post(reverse("blackjack-split"))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"], "You cannot split that hand.")
        self.assertEqual(response.data["balance"], SIGNUP_COINS - 25)
        self.assertEqual(len(response.data["round"]["hands"]), 1)

    def test_an_action_with_no_round_behind_it_is_refused(self):
        response = self.client.post(reverse("blackjack-hit"))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIsNone(response.data["round"])

    def test_a_stake_off_the_table_is_refused_before_anything_is_charged(self):
        response = self.client.post(reverse("blackjack-deal"), {"stake": 5000}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["balance"], SIGNUP_COINS)
        self.assertIsNone(response.data["round"])

    def test_a_double_nobody_can_afford_is_not_offered(self):
        """`can` is the whole truth about what will be accepted, so a double
        the wallet cannot cover is false rather than a button that refuses."""
        spend(self.user, SIGNUP_COINS - 25, "stake")
        with self._fixed(("5s", "6d"), ("9h", "7c")):
            response = self.client.post(reverse("blackjack-deal"), {"stake": 25}, format="json")

        self.assertEqual(response.data["balance"], 0)
        self.assertFalse(response.data["round"]["hands"][0]["can"]["double"])
        self.assertTrue(response.data["round"]["hands"][0]["can"]["hit"])

    def test_a_split_is_played_one_hand_at_a_time_over_the_wire(self):
        with self._fixed(("8s", "8d"), ("Ts", "7h"), "Kc", "Kh"):
            self.client.post(reverse("blackjack-deal"), {"stake": 25}, format="json")

        split = self.client.post(reverse("blackjack-split"))

        self.assertEqual(split.status_code, status.HTTP_200_OK)
        self.assertEqual(split.data["balance"], SIGNUP_COINS - 50)
        self.assertEqual(split.data["round"]["active"], 0)
        self.assertEqual(len(split.data["round"]["hands"]), 2)
        # Only the hand being played is offered anything.
        self.assertTrue(split.data["round"]["hands"][0]["can"]["stand"])
        self.assertEqual(split.data["round"]["hands"][1]["can"], blackjack.NO_ACTIONS)
        # And neither of them may be split again.
        self.assertFalse(split.data["round"]["hands"][0]["can"]["split"])

        first = self.client.post(reverse("blackjack-stand"))
        self.assertEqual(first.data["round"]["active"], 1)

        second = self.client.post(reverse("blackjack-stand"))
        self.assertEqual(second.data["round"]["net"], 50)
        self.assertEqual(second.data["balance"], SIGNUP_COINS + 50)

    def test_a_double_submitted_hit_deals_one_card_rather_than_two(self):
        with self._fixed(("2s", "3d"), ("Ts", "7h"), "4c", "5h", "6d"):
            self.client.post(reverse("blackjack-deal"), {"stake": 25}, format="json")

        one = self.client.post(reverse("blackjack-hit"))
        # The second request reads the round as the first one left it, which is
        # the point of the row lock: it hits the three-card hand rather than the
        # two-card hand the client still had on screen.
        two = self.client.post(reverse("blackjack-hit"))

        self.assertEqual(one.data["round"]["hands"][0]["cards"], ["2s", "3d", "4c"])
        self.assertEqual(two.data["round"]["hands"][0]["cards"], ["2s", "3d", "4c", "5h"])


class BlackjackTableRulesTests(TestCase):
    """The clock, with no database near it."""

    def test_a_window_that_has_run_out_has_no_time_left_rather_than_negative(self):
        from .blackjacktable import seconds_left

        now = timezone.now()
        self.assertAlmostEqual(seconds_left(now + timedelta(seconds=5), now), 5.0, places=1)
        # A window closed a minute ago is not "minus sixty seconds to go": the
        # client prints this, and a countdown that goes negative is a bug
        # somebody screenshots.
        self.assertEqual(seconds_left(now - timedelta(seconds=60), now), 0.0)

    def test_betting_only_becomes_playing_when_a_round_was_actually_dealt(self):
        from .blackjacktable import BETTING, PLAYING, SETTLING, phase_after

        # Nobody bet, so there is nothing to play: the window comes round again.
        self.assertEqual(phase_after(BETTING, dealt=False), BETTING)
        self.assertEqual(phase_after(BETTING, dealt=True), PLAYING)
        self.assertEqual(phase_after(PLAYING, dealt=True), SETTLING)
        self.assertEqual(phase_after(SETTLING, dealt=True), BETTING)


class BlackjackTableApiTests(APITestCase):
    """Eight seats, one dealer, and the money that moves between them."""

    def setUp(self):
        User = get_user_model()
        self.ana = User.objects.create_user(username="bj_ana", password="x")
        self.bea = User.objects.create_user(username="bj_bea", password="x")
        self.client.force_authenticate(self.ana)

    def _as(self, user):
        self.client.force_authenticate(user)

    def _balance(self, user):
        from .economy import wallet_for

        return wallet_for(user).balance

    def _table(self):
        from .blackjacktable import public_table

        return public_table()

    def _run_out(self):
        """Close whatever window is open, without waiting for the clock."""
        table = self._table()
        table.phase_ends_at = timezone.now() - timedelta(seconds=1)
        table.save(update_fields=["phase_ends_at"])

    def test_the_table_is_eight_seats_whether_or_not_anybody_is_in_them(self):
        response = self.client.get(reverse("blackjack-table"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        seats = response.data["table"]["seats"]
        self.assertEqual([seat["seat"] for seat in seats], list(range(8)))
        self.assertTrue(all(seat["player"] is None for seat in seats))
        self.assertIsNone(response.data["table"]["my_seat"])

    def test_a_seat_somebody_is_in_cannot_be_taken_by_anybody_else(self):
        self.client.post(reverse("blackjack-table-sit"), {"seat": 3}, format="json")

        self._as(self.bea)
        response = self.client.post(reverse("blackjack-table-sit"), {"seat": 3}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # The refusal still draws the table, and it draws ana in the chair.
        self.assertEqual(response.data["table"]["seats"][3]["player"]["username"], "bj_ana")
        self.assertIsNone(response.data["table"]["my_seat"])

    def test_one_player_holds_one_seat(self):
        self.client.post(reverse("blackjack-table-sit"), {"seat": 0}, format="json")
        response = self.client.post(reverse("blackjack-table-sit"), {"seat": 1}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["table"]["my_seat"], 0)

    def test_a_bet_needs_a_seat_and_a_bet_within_the_limits(self):
        response = self.client.post(reverse("blackjack-table-bet"), {"amount": 25}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.post(reverse("blackjack-table-sit"), {"seat": 0}, format="json")
        for amount in (1, 5000):
            with self.subTest(amount=amount):
                refused = self.client.post(
                    reverse("blackjack-table-bet"), {"amount": amount}, format="json",
                )
                self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._balance(self.ana), SIGNUP_COINS)

    def test_a_bet_is_taken_once_and_not_topped_up(self):
        self.client.post(reverse("blackjack-table-sit"), {"seat": 0}, format="json")
        self.client.post(reverse("blackjack-table-bet"), {"amount": 25}, format="json")

        self.assertEqual(self._balance(self.ana), SIGNUP_COINS - 25)

        second = self.client.post(reverse("blackjack-table-bet"), {"amount": 25}, format="json")
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._balance(self.ana), SIGNUP_COINS - 25)

    def test_nobody_betting_rolls_the_window_over_rather_than_dealing(self):
        self.client.post(reverse("blackjack-table-sit"), {"seat": 0}, format="json")
        self._run_out()

        response = self.client.get(reverse("blackjack-table"))

        self.assertEqual(response.data["table"]["phase"], "betting")
        self.assertEqual(response.data["table"]["round"], 0)
        self.assertGreater(response.data["table"]["ends_in"], 0)

    def _shoe(self, *named):
        """Two decks with these cards on top, in the order they come out.

        The table deals round the seats, then the dealer's up card, then round
        the seats again, then the hole card, so `named` reads in exactly that
        order — and anything after the sixth is a card drawn later, in the order
        it is drawn. The rest of the shoe follows in an order nobody should
        depend on: a test that needs a particular card must name it.
        """
        named = list(named)
        assert len(set(named)) == len(named), "a stacked shoe named the same card twice"
        rest = [
            rank + suit
            for _ in range(blackjacktable.SHOE_DECKS)
            for rank in blackjack.RANKS for suit in blackjack.SUITS
        ]
        for card in named:
            rest.remove(card)
        return named + rest

    # Two sixteens and a dealer showing five: nobody is dealt a natural, both
    # seats still have something to decide, and the dealer has to draw. The deal
    # used to come out of a shuffled shoe, which meant about one run in twenty
    # gave the dealer blackjack and settled the round before the playing window
    # ever opened — and every test below that assumes a window failed for a
    # reason that had nothing to do with what it was testing.
    QUIET = ("9s", "Td", "5s", "7h", "6c", "9c")

    def _deal_a_round(self, *named):
        """Both players seated and bet, and the betting window closed."""
        self._as(self.ana)
        self.client.post(reverse("blackjack-table-sit"), {"seat": 0}, format="json")
        self.client.post(reverse("blackjack-table-bet"), {"amount": 25}, format="json")
        self._as(self.bea)
        self.client.post(reverse("blackjack-table-sit"), {"seat": 4}, format="json")
        self.client.post(reverse("blackjack-table-bet"), {"amount": 25}, format="json")
        self._run_out()
        shoe = self._shoe(*(named or self.QUIET))
        with mock.patch.object(blackjacktable, "fresh_shoe", return_value=shoe):
            return self.client.get(reverse("blackjack-table")).data["table"]

    def test_everybody_is_dealt_against_the_same_dealer_hand(self):
        table = self._deal_a_round()

        self.assertEqual(table["phase"], "playing")
        self.assertEqual(table["round"], 1)
        played = [seat for seat in table["seats"] if seat["player"]]
        self.assertEqual(len(played), 2)
        for seat in played:
            self.assertEqual(len(seat["hands"]), 1)
            self.assertEqual(len(seat["hands"][0]["cards"]), 2)
        # One dealer, one hole card, and the whole table settles against it.
        self.assertEqual(len(table["dealer"]["cards"]), 2)
        self.assertEqual(table["dealer"]["cards"][1], "??")

    def test_the_shoe_and_the_hole_card_stay_on_the_server(self):
        table = self._deal_a_round()

        self.assertNotIn("deck", table)
        self.assertEqual(table["dealer"]["cards"][1], "??")
        # The total is of the up card alone. Sending the true one beside a
        # hidden card gives the hole card away by subtraction.
        real = self._table()
        up_only, _ = blackjack.hand_value(real.dealer[:1])
        self.assertEqual(table["dealer"]["total"], up_only)
        self.assertFalse(table["dealer"]["blackjack"])

    def test_only_your_own_seat_is_ever_offered_a_button(self):
        table = self._deal_a_round()   # authenticated as bea, in seat 4

        mine = next(seat for seat in table["seats"] if seat["seat"] == 4)
        theirs = next(seat for seat in table["seats"] if seat["seat"] == 0)
        self.assertTrue(any(mine["hands"][0]["can"].values()))
        self.assertFalse(any(theirs["hands"][0]["can"].values()))

    def test_a_seat_that_never_acts_is_stood_and_still_settles(self):
        self._deal_a_round()
        # Neither player touches a button; the playing window simply runs out.
        self._run_out()

        table = self.client.get(reverse("blackjack-table")).data["table"]

        self.assertEqual(table["phase"], "settling")
        for seat in [one for one in table["seats"] if one["player"]]:
            self.assertIsNotNone(seat["hands"][0]["outcome"])
        # And the dealer is face up now that there is nothing left to decide.
        self.assertNotIn("??", table["dealer"]["cards"])

    def test_the_dealer_turns_over_the_moment_the_last_player_has_played(self):
        # The window is a deadline, not a duration. Both seats stand well inside
        # it, nobody touches the clock, and the round is over: a hole card whose
        # value is already fixed has nothing to gain by staying face down while
        # the table watches a countdown.
        self._deal_a_round()

        self._as(self.ana)
        first = self.client.post(
            reverse("blackjack-table-act"), {"action": "stand"}, format="json",
        ).data["table"]
        # One seat still to play, so nothing has moved and nothing is shown.
        self.assertEqual(first["phase"], "playing")
        self.assertEqual(first["dealer"]["cards"][1], "??")

        self._as(self.bea)
        table = self.client.post(
            reverse("blackjack-table-act"), {"action": "stand"}, format="json",
        ).data["table"]

        self.assertEqual(table["phase"], "settling")
        self.assertNotIn("??", table["dealer"]["cards"])
        for seat in [one for one in table["seats"] if one["player"]]:
            self.assertIsNotNone(seat["hands"][0]["outcome"])

    def test_closing_early_gives_settling_its_own_six_seconds(self):
        # An early close has no old end worth adding to. Rolling from the
        # playing window's scheduled end would hold the cards up for the seconds
        # the players saved and then six more.
        self._deal_a_round()
        self._as(self.ana)
        self.client.post(reverse("blackjack-table-act"), {"action": "stand"}, format="json")
        self._as(self.bea)
        self.client.post(reverse("blackjack-table-act"), {"action": "stand"}, format="json")

        table = self.client.get(reverse("blackjack-table")).data["table"]
        self.assertEqual(table["phase"], "settling")
        self.assertLessEqual(
            table["ends_in"], blackjacktable.PHASE_SECONDS[blackjacktable.SETTLING],
        )

    def test_a_seat_that_has_busted_is_not_waited_for(self):
        # Ana draws to twenty-six, which decides her hand as firmly as standing
        # does. Bea is then the last decision at the table.
        self._deal_a_round(*self.QUIET, "Th")

        self._as(self.ana)
        busted = self.client.post(
            reverse("blackjack-table-act"), {"action": "hit"}, format="json",
        ).data["table"]
        self.assertEqual(busted["seats"][0]["hands"][0]["status"], "bust")
        # Bea has not played, so the dealer waits for her however dead ana is.
        self.assertEqual(busted["phase"], "playing")
        self.assertEqual(busted["dealer"]["cards"][1], "??")

        self._as(self.bea)
        table = self.client.post(
            reverse("blackjack-table-act"), {"action": "stand"}, format="json",
        ).data["table"]

        self.assertEqual(table["phase"], "settling")
        self.assertNotIn("??", table["dealer"]["cards"])

    def test_a_split_is_not_mistaken_for_being_finished(self):
        # Splitting replaces one decision with two, so the seat that splits is
        # further from done than it was. Bea stands first, which leaves ana as
        # the only seat still holding the round up.
        self._deal_a_round("8s", "Td", "5s", "8h", "6c", "9c", "2h", "3h")
        self._as(self.bea)
        self.client.post(reverse("blackjack-table-act"), {"action": "stand"}, format="json")

        self._as(self.ana)
        after = self.client.post(
            reverse("blackjack-table-act"), {"action": "split"}, format="json",
        ).data["table"]

        self.assertEqual(len(after["seats"][0]["hands"]), 2)
        self.assertEqual(after["phase"], "playing")
        self.assertEqual(after["dealer"]["cards"][1], "??")

        # Both halves stood, and only then is the table finished with her.
        self.client.post(reverse("blackjack-table-act"), {"action": "stand"}, format="json")
        table = self.client.post(
            reverse("blackjack-table-act"), {"action": "stand"}, format="json",
        ).data["table"]
        self.assertEqual(table["phase"], "settling")
        self.assertNotIn("??", table["dealer"]["cards"])

    def test_a_round_pays_out_once_however_many_times_it_is_walked(self):
        self._deal_a_round()
        self._run_out()
        self.client.get(reverse("blackjack-table"))
        after_first = self._balance(self.bea)

        for _ in range(3):
            self.client.get(reverse("blackjack-table"))

        self.assertEqual(self._balance(self.bea), after_first)

    def test_acting_only_ever_touches_your_own_hand(self):
        self._deal_a_round()
        self._as(self.ana)
        before = len(self.client.get(reverse("blackjack-table"))
                     .data["table"]["seats"][4]["hands"][0]["cards"])

        # There is no seat on the wire at all: acting is always on your own
        # seat, which is the shape of the protection rather than a check.
        self.client.post(reverse("blackjack-table-act"), {"action": "hit"}, format="json")

        after = self.client.get(reverse("blackjack-table")).data["table"]
        self.assertEqual(len(after["seats"][4]["hands"][0]["cards"]), before)
        self.assertEqual(len(after["seats"][0]["hands"][0]["cards"]), 3)

    def test_a_stranger_gets_nothing_from_the_table(self):
        self.client.force_authenticate(None)
        self.assertEqual(
            self.client.get(reverse("blackjack-table")).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_leaving_frees_the_chair(self):
        self.client.post(reverse("blackjack-table-sit"), {"seat": 2}, format="json")
        response = self.client.post(reverse("blackjack-table-leave"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["table"]["my_seat"])
        self.assertIsNone(response.data["table"]["seats"][2]["player"])

    def test_a_table_left_alone_for_hours_lands_somewhere_coherent(self):
        self.client.post(reverse("blackjack-table-sit"), {"seat": 0}, format="json")
        self.client.post(reverse("blackjack-table-bet"), {"amount": 25}, format="json")
        table = self._table()
        table.phase_ends_at = timezone.now() - timedelta(hours=3)
        table.save(update_fields=["phase_ends_at"])

        data = self.client.get(reverse("blackjack-table")).data["table"]

        # Whatever it walked through, it is in a real phase with a real clock.
        self.assertIn(data["phase"], ("betting", "playing", "settling"))
        self.assertGreater(data["ends_in"], 0)
        self.assertLessEqual(data["ends_in"], 20)
