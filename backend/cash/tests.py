from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

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


class CashRoomTests(TestCase):
    """A table dealing, with the world stubbed out around it.

    Dictionaries for seats and lists for what went out: what is being checked
    is the loop — who is dealt in, where the button goes, what happens to the
    stacks — rather than the plumbing under it.
    """

    def setUp(self):
        self.written = []
        self.hands = []
        self.events = []
        self.settled = 0

    def _room(self, seats, **options):
        from asgiref.sync import async_to_sync   # noqa: F401  (used by callers)

        from .room import CashRoom
        from .stakes import stake_for

        self.seats = [dict(one) for one in seats]

        async def load_seats():
            return [dict(one) for one in self.seats]

        async def persist_stacks(stacks):
            self.written.append(dict(stacks))
            for seat in self.seats:
                if seat["seat"] in stacks:
                    seat["stack"] = stacks[seat["seat"]]

        async def settle_leavers():
            self.settled += 1

        async def broadcast(event_type, payload):
            self.events.append((event_type, payload))

        async def request_action(player, context):
            valid = context["valid_actions"]
            return ("check", 0) if "check" in valid else ("call", 0)

        async def record_hand(row):
            self.hands.append(row)

        return CashRoom(
            table_id=1,
            stake=stake_for("low"),
            seat_count=6,
            load_seats=load_seats,
            persist_stacks=persist_stacks,
            settle_leavers=settle_leavers,
            broadcast=broadcast,
            request_action=request_action,
            record_hand=record_hand,
            pause_between_hands=0,
            idle_poll=0,
            **options,
        )

    def _seat(self, seat, stack=500, **extra):
        return {"seat": seat, "user_id": 100 + seat, "name": f"p{seat}", "stack": stack, **extra}

    def test_a_hand_is_dealt_and_the_stacks_are_written_down(self):
        room = self._room([self._seat(0), self._seat(1), self._seat(2)])
        room.seats = [dict(one) for one in self.seats]

        result = async_to_sync(room.play_hand)()

        self.assertEqual(room.hand_number, 1)
        self.assertTrue(self.written)
        # Every coin is still on the table: a cash hand moves chips between
        # stacks and creates none.
        self.assertEqual(sum(self.written[-1].values()), 1500)
        self.assertTrue(result.pot_awards)

    def test_the_button_moves_round_the_players_being_dealt_in(self):
        room = self._room([self._seat(0), self._seat(2), self._seat(4)])
        room.seats = [dict(one) for one in self.seats]

        seen = []
        for _ in range(4):
            async_to_sync(room.play_hand)()
            seen.append(room.button)

        self.assertEqual(seen, [0, 2, 4, 0])

    def test_somebody_sitting_out_is_not_dealt_in(self):
        room = self._room([self._seat(0), self._seat(1), self._seat(2, sitting_out=True)])
        room.seats = [dict(one) for one in self.seats]

        async_to_sync(room.play_hand)()

        self.assertNotIn(2, self.written[-1])

    def test_a_hand_is_written_to_the_history_with_its_boards(self):
        room = self._room([self._seat(0), self._seat(1)])
        room.seats = [dict(one) for one in self.seats]

        async_to_sync(room.play_hand)()

        row = self.hands[-1]
        self.assertEqual(row["hand_number"], 1)
        self.assertGreater(row["pot"], 0)
        self.assertEqual(len(row["boards"]), 1)
        self.assertFalse(row["was_bomb_pot"])

    def test_a_bomb_pot_comes_round_on_the_count_and_deals_two_boards(self):
        room = self._room([self._seat(0), self._seat(1)], bomb_pot_every=2, bomb_pot_bb=2)
        room.seats = [dict(one) for one in self.seats]

        async_to_sync(room.play_hand)()   # an ordinary one
        async_to_sync(room.play_hand)()   # and the bomb

        self.assertFalse(self.hands[0]["was_bomb_pot"])
        self.assertTrue(self.hands[1]["was_bomb_pot"])
        self.assertEqual(len(self.hands[1]["boards"]), 2)
        # Still nobody's coins invented: two boards, one pot.
        self.assertEqual(sum(self.written[-1].values()), 1000)

    def test_leavers_are_settled_after_every_hand_rather_than_during_one(self):
        room = self._room([self._seat(0), self._seat(1)])
        room.seats = [dict(one) for one in self.seats]

        async_to_sync(room.play_hand)()

        self.assertEqual(self.settled, 1)

    def test_a_table_with_nobody_at_it_waits_rather_than_dealing(self):
        room = self._room([self._seat(0)])
        room.running = True

        async def one_pass():
            room.seats = await room.load_seats()
            if not __import__("cash.seating", fromlist=["can_deal"]).can_deal(room.seats):
                await room._announce_waiting()

        async_to_sync(one_pass)()

        self.assertEqual(room.hand_number, 0)
        self.assertEqual(self.events[-1][0], "table_waiting")

    def test_the_snapshot_says_what_the_table_looks_like_between_hands(self):
        room = self._room([self._seat(0), self._seat(3, stack=250)])
        room.seats = [dict(one) for one in self.seats]

        snapshot = room.snapshot()

        self.assertEqual(snapshot["stake"]["big_blind"], 5)
        self.assertEqual([one["seat"] for one in snapshot["players"]], [0, 3])
        self.assertEqual(snapshot["players"][1]["chips"], 250)

    def test_a_hand_in_progress_can_be_asked_who_is_at_a_seat(self):
        room = self._room([self._seat(0), self._seat(1)])
        room.seats = [dict(one) for one in self.seats]

        async def during():
            room.hand_number += 1
            room.button = 0
            playing = [dict(one) for one in room.seats]
            room._playing = {one["seat"]: room._runtime(one) for one in playing}
            return room.player_at(101)

        found = async_to_sync(during)()

        self.assertIsNotNone(found)
        self.assertEqual(found._seat, 1)


class CashLobbyApiTests(APITestCase):
    """The lobby, and the ways in and out of a table."""

    def setUp(self):
        self.player = User.objects.create_user(username="cl_player", password="secret123")
        wallet_for(self.player)
        Wallet.objects.filter(user=self.player).update(balance=2000)
        self.staff = User.objects.create_user(username="cl_staff", password="secret123", is_staff=True)
        self.table = CashTable.objects.create(name="Low 6-max", stake="low", seat_count=6)
        self.client.force_authenticate(self.player)

    def test_the_lobby_lists_the_ladder_and_the_open_tables(self):
        response = self.client.get(reverse("cash-lobby"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["stakes"]), 5)
        self.assertEqual(len(response.data["tables"]), 1)
        row = response.data["tables"][0]
        self.assertEqual(row["stake_label"], "2/5")
        self.assertEqual(row["min_buy_in"], 100)
        self.assertEqual(row["max_buy_in"], 500)
        self.assertIsNone(row["my_seat"])

    def test_a_closed_table_is_not_in_the_lobby(self):
        CashTable.objects.filter(pk=self.table.pk).update(is_open=False)

        self.assertEqual(self.client.get(reverse("cash-lobby")).data["tables"], [])

    def test_sitting_down_takes_the_coins_and_gives_a_seat(self):
        response = self.client.post(
            reverse("cash-sit", args=[self.table.id]), {"buy_in": 300}, format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["stack"], 300)
        self.assertEqual(response.data["balance"], 1700)
        self.assertEqual(response.data["table"]["my_seat"], 0)

    def test_the_first_free_chair_is_the_default(self):
        other = User.objects.create_user(username="cl_other", password="secret123")
        wallet_for(other)
        Wallet.objects.filter(user=other).update(balance=2000)
        self.client.post(reverse("cash-sit", args=[self.table.id]), {"buy_in": 300}, format="json")

        self.client.force_authenticate(other)
        response = self.client.post(
            reverse("cash-sit", args=[self.table.id]), {"buy_in": 300}, format="json",
        )

        self.assertEqual(response.data["seat"], 1)

    def test_a_buy_in_under_the_minimum_is_refused(self):
        response = self.client.post(
            reverse("cash-sit", args=[self.table.id]), {"buy_in": 20}, format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Wallet.objects.get(user=self.player).balance, 2000)

    def test_leaving_between_hands_hands_the_stack_back(self):
        self.client.post(reverse("cash-sit", args=[self.table.id]), {"buy_in": 300}, format="json")

        response = self.client.post(reverse("cash-leave", args=[self.table.id]), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["cashed_out"], 300)
        self.assertEqual(Wallet.objects.get(user=self.player).balance, 2000)

    def test_topping_up_is_capped_at_the_table_maximum(self):
        self.client.post(reverse("cash-sit", args=[self.table.id]), {"buy_in": 300}, format="json")

        ok = self.client.post(
            reverse("cash-add-chips", args=[self.table.id]), {"amount": 200}, format="json",
        )
        too_much = self.client.post(
            reverse("cash-add-chips", args=[self.table.id]), {"amount": 100}, format="json",
        )

        self.assertEqual(ok.data["stack"], 500)
        self.assertEqual(too_much.status_code, status.HTTP_400_BAD_REQUEST)

    def test_sitting_out_and_back_in(self):
        self.client.post(reverse("cash-sit", args=[self.table.id]), {"buy_in": 300}, format="json")

        out = self.client.post(
            reverse("cash-sit-out", args=[self.table.id]), {"value": True}, format="json",
        )
        back = self.client.post(
            reverse("cash-sit-out", args=[self.table.id]), {"value": False}, format="json",
        )

        self.assertTrue(out.data["sitting_out"])
        self.assertFalse(back.data["sitting_out"])

    def test_a_player_cannot_open_a_public_table(self):
        response = self.client.post(
            reverse("cash-open"), {"stake": "low", "seats": 6}, format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_club_organiser_can_open_one_in_their_club(self):
        from clubs.models import Club, Membership

        club = Club.objects.create(name="Quinta", created_by=self.player)
        Membership.objects.create(club=club, user=self.player, role=Membership.OWNER)

        response = self.client.post(
            reverse("cash-open"),
            {"stake": "mid", "seats": 9, "club": club.slug, "run_it_twice": True,
             "bomb_pot_every": 10, "name": "Friday cash"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["club_name"], "Quinta")
        self.assertEqual(response.data["seats"], 9)
        self.assertTrue(response.data["run_it_twice"])
        self.assertEqual(response.data["bomb_pot_every"], 10)

    def test_somebody_who_only_plays_at_a_club_cannot_open_its_tables(self):
        from clubs.models import Club, Membership

        club = Club.objects.create(name="Quinta", created_by=self.staff)
        Membership.objects.create(club=club, user=self.player, role=Membership.MEMBER)

        response = self.client.post(
            reverse("cash-open"), {"stake": "low", "club": club.slug}, format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_closing_a_table_pays_everybody_and_shuts_it(self):
        self.client.post(reverse("cash-sit", args=[self.table.id]), {"buy_in": 300}, format="json")
        table = CashTable.objects.get(pk=self.table.pk)
        table.created_by = self.player
        table.save(update_fields=["created_by"])

        response = self.client.post(reverse("cash-close", args=[table.id]), {}, format="json")

        self.assertEqual(response.data["paid_out"], 300)
        self.assertEqual(Wallet.objects.get(user=self.player).balance, 2000)
        table.refresh_from_db()
        self.assertFalse(table.is_open)

    def test_a_table_nobody_owns_is_not_closed_by_a_passer_by(self):
        response = self.client.post(reverse("cash-close", args=[self.table.id]), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.table.refresh_from_db()
        self.assertTrue(self.table.is_open)

    def test_the_lobby_can_be_asked_for_one_club_s_tables(self):
        from clubs.models import Club, Membership

        club = Club.objects.create(name="Quinta", created_by=self.player)
        Membership.objects.create(club=club, user=self.player, role=Membership.OWNER)
        self.client.post(
            reverse("cash-open"), {"stake": "mid", "club": club.slug}, format="json",
        )

        rows = self.client.get(reverse("cash-lobby"), {"club": club.slug}).data["tables"]

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["club_name"], "Quinta")
