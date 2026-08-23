from datetime import datetime, timedelta

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
from .models import CoinLedger, MissionClaim, Unlock, Wallet
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
