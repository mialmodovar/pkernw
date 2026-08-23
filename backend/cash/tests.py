from django.contrib.auth import get_user_model
from django.test import TestCase

from sidegames.economy import wallet_for
from sidegames.models import CoinLedger, Wallet

from .bank import cash_out_everybody, sit_down, stand_up, top_up
from .models import CashSeat, CashTable
from .seating import can_deal, dealable, is_bomb_pot, next_button, next_free_seat, open_seats
from .stakes import STAKES, clean_buy_in, stake_for, top_up_room

User = get_user_model()


class StakeLadderTests(TestCase):
    """The rungs, and what it costs to stand on one."""

    def test_every_stake_asks_for_twenty_blinds_and_allows_a_hundred(self):
        for stake in STAKES:
            with self.subTest(stake=stake.key):
                self.assertEqual(stake.min_buy_in, stake.big_blind * 20)
                self.assertEqual(stake.max_buy_in, stake.big_blind * 100)
                self.assertLess(stake.small_blind, stake.big_blind)

    def test_the_ladder_climbs_and_never_repeats(self):
        blinds = [one.big_blind for one in STAKES]
        self.assertEqual(blinds, sorted(blinds))
        self.assertEqual(len(set(blinds)), len(blinds))

    def test_a_buy_in_has_to_be_between_the_two(self):
        stake = stake_for("low")

        self.assertEqual(clean_buy_in(stake, 200), 200)
        self.assertIsInstance(clean_buy_in(stake, 10), str)
        self.assertIsInstance(clean_buy_in(stake, 10_000), str)
        self.assertIsInstance(clean_buy_in(stake, "lots"), str)

    def test_a_buy_in_bigger_than_the_wallet_is_refused_rather_than_trimmed(self):
        """Quietly taking fewer coins than somebody typed is not a fix for
        having misread the table."""
        stake = stake_for("low")

        self.assertIsInstance(clean_buy_in(stake, 400, wallet_balance=50), str)

    def test_topping_up_stops_at_the_table_maximum(self):
        stake = stake_for("low")   # 2/5, so a hundred blinds is 500

        self.assertEqual(top_up_room(stake, 100), 400)
        self.assertEqual(top_up_room(stake, 500), 0)
        # A stack that grew past the cap by winning is theirs; it just cannot
        # be added to.
        self.assertEqual(top_up_room(stake, 900), 0)

    def test_an_unknown_stake_is_nobody_s_table(self):
        self.assertIsNone(stake_for("nosebleed"))
        self.assertIsNone(stake_for(None))


class SeatingTests(TestCase):
    """Who is dealt in, and where the button goes."""

    def _seats(self, *specs):
        return [
            {"seat": seat, "stack": stack, "sitting_out": out, "leaving": leaving}
            for seat, stack, out, leaving in specs
        ]

    def test_a_hand_needs_two_players_with_chips(self):
        self.assertFalse(can_deal(self._seats((0, 500, False, False))))
        self.assertTrue(can_deal(self._seats((0, 500, False, False), (1, 500, False, False))))

    def test_somebody_sitting_out_is_not_dealt_in(self):
        seats = self._seats((0, 500, False, False), (1, 500, True, False))

        self.assertEqual([one["seat"] for one in dealable(seats)], [0])
        self.assertFalse(can_deal(seats))

    def test_an_empty_stack_is_not_a_knockout_but_it_is_not_a_hand_either(self):
        """In a cash game nought chips means somebody has to reach for their
        wallet, not that they are out of the game."""
        seats = self._seats((0, 500, False, False), (1, 0, False, False))

        self.assertFalse(can_deal(seats))

    def test_somebody_on_their_way_out_takes_no_more_cards(self):
        seats = self._seats((0, 500, False, False), (1, 500, False, True))

        self.assertEqual([one["seat"] for one in dealable(seats)], [0])

    def test_the_button_moves_over_the_empty_chairs(self):
        seats = self._seats((0, 500, False, False), (3, 500, False, False), (5, 500, False, False))

        self.assertEqual(next_button(seats, 0), 3)
        self.assertEqual(next_button(seats, 3), 5)
        # And wraps.
        self.assertEqual(next_button(seats, 5), 0)

    def test_the_button_skips_anybody_not_being_dealt_in(self):
        seats = self._seats((0, 500, False, False), (1, 500, True, False), (2, 500, False, False))

        self.assertEqual(next_button(seats, 0), 2)

    def test_the_first_hand_starts_the_button_somewhere(self):
        seats = self._seats((2, 500, False, False), (4, 500, False, False))

        self.assertEqual(next_button(seats, None), 2)

    def test_free_seats_are_offered_lowest_first(self):
        self.assertEqual(open_seats([0, 2], 4), [1, 3])
        self.assertEqual(next_free_seat([0, 2], 4), 1)
        self.assertIsNone(next_free_seat([0, 1, 2, 3], 4))

    def test_a_bomb_pot_comes_round_on_the_count(self):
        self.assertFalse(is_bomb_pot(9, 10))
        self.assertTrue(is_bomb_pot(10, 10))
        self.assertTrue(is_bomb_pot(20, 10))
        # Switched off is switched off.
        self.assertFalse(is_bomb_pot(10, 0))
        self.assertFalse(is_bomb_pot(0, 10))


class CashBankTests(TestCase):
    """Coins on and off the felt. The one invariant this all rests on."""

    def setUp(self):
        self.user = User.objects.create_user(username="cash_one", password="secret123")
        wallet_for(self.user)
        Wallet.objects.filter(user=self.user).update(balance=1000)
        self.table = CashTable.objects.create(name="Low", stake="low", seat_count=6)

    def _balance(self):
        return Wallet.objects.get(user=self.user).balance

    def test_sitting_down_moves_coins_from_the_wallet_to_the_felt(self):
        seat = sit_down(self.table, self.user, 200, seat_number=0)

        self.assertIsInstance(seat, CashSeat)
        self.assertEqual(seat.stack, 200)
        self.assertEqual(self._balance(), 800)
        # And the two still add up to what they had.
        self.assertEqual(self._balance() + seat.stack, 1000)

    def test_standing_up_brings_the_whole_stack_back(self):
        seat = sit_down(self.table, self.user, 200, seat_number=0)
        CashSeat.objects.filter(pk=seat.pk).update(stack=340)   # they won some
        seat.refresh_from_db()

        paid = stand_up(seat)

        self.assertEqual(paid, 340)
        self.assertEqual(self._balance(), 1140)
        self.assertFalse(CashSeat.objects.filter(pk=seat.pk).exists())

    def test_a_stack_lost_at_the_table_is_a_stack_lost(self):
        seat = sit_down(self.table, self.user, 200, seat_number=0)
        CashSeat.objects.filter(pk=seat.pk).update(stack=0)
        seat.refresh_from_db()

        stand_up(seat)

        self.assertEqual(self._balance(), 800)

    def test_every_move_is_written_down(self):
        seat = sit_down(self.table, self.user, 200, seat_number=0)
        stand_up(seat)

        rows = CoinLedger.objects.filter(user=self.user, memo=f"cash:{self.table.id}")
        self.assertEqual(sorted(row.amount for row in rows), [-200, 200])

    def test_you_cannot_sit_at_the_same_table_twice(self):
        sit_down(self.table, self.user, 200, seat_number=0)

        again = sit_down(self.table, self.user, 200, seat_number=1)

        self.assertIsInstance(again, str)
        self.assertEqual(CashSeat.objects.filter(table=self.table).count(), 1)
        self.assertEqual(self._balance(), 800)

    def test_two_people_cannot_have_one_chair(self):
        other = User.objects.create_user(username="cash_two", password="secret123")
        wallet_for(other)
        Wallet.objects.filter(user=other).update(balance=1000)
        sit_down(self.table, self.user, 200, seat_number=0)

        clash = sit_down(self.table, other, 200, seat_number=0)

        self.assertIsInstance(clash, str)
        self.assertEqual(Wallet.objects.get(user=other).balance, 1000)

    def test_an_empty_wallet_sits_at_nothing(self):
        Wallet.objects.filter(user=self.user).update(balance=10)

        refused = sit_down(self.table, self.user, 200, seat_number=0)

        self.assertIsInstance(refused, str)
        self.assertFalse(CashSeat.objects.exists())

    def test_a_closed_table_takes_nobody(self):
        self.table.is_open = False
        self.table.save(update_fields=["is_open"])

        self.assertIsInstance(sit_down(self.table, self.user, 200, seat_number=0), str)

    def test_topping_up_adds_to_the_stack_and_takes_from_the_wallet(self):
        seat = sit_down(self.table, self.user, 200, seat_number=0)

        topped = top_up(seat, 100)

        self.assertEqual(topped.stack, 300)
        self.assertEqual(topped.bought_in, 300)
        self.assertEqual(self._balance(), 700)

    def test_topping_up_past_the_table_maximum_is_refused(self):
        seat = sit_down(self.table, self.user, 500, seat_number=0)   # already the cap

        self.assertIsInstance(top_up(seat, 100), str)
        self.assertEqual(self._balance(), 500)

    def test_closing_a_table_pays_everybody_back(self):
        other = User.objects.create_user(username="cash_three", password="secret123")
        wallet_for(other)
        Wallet.objects.filter(user=other).update(balance=1000)
        sit_down(self.table, self.user, 200, seat_number=0)
        sit_down(self.table, other, 300, seat_number=1)

        paid = cash_out_everybody(self.table)

        self.assertEqual(paid, 500)
        self.assertEqual(self._balance(), 1000)
        self.assertEqual(Wallet.objects.get(user=other).balance, 1000)
        self.assertFalse(CashSeat.objects.filter(table=self.table).exists())

    def test_the_coins_are_never_anywhere_but_the_wallet_or_the_felt(self):
        """The whole invariant, walked: sit, top up, win some, leave."""
        seat = sit_down(self.table, self.user, 200, seat_number=0)
        top_up(seat, 100)
        seat.refresh_from_db()
        # A pot lands.
        CashSeat.objects.filter(pk=seat.pk).update(stack=seat.stack + 260)
        seat.refresh_from_db()

        self.assertEqual(self._balance() + seat.stack, 1000 + 260)

        stand_up(seat)
        self.assertEqual(self._balance(), 1000 + 260)
