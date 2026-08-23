from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model
from django.test import TestCase, TransactionTestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from sidegames.economy import wallet_for
from sidegames.models import CoinLedger, Wallet

from .bank import cash_out_everybody, sit_down, stand_up, top_up
from .models import CashHand, CashSeat, CashTable
from .seating import can_deal, dealable, is_bomb_pot, next_button, next_free_seat, open_seats
from .stakes import STAKES, clean_buy_in, stake_for, top_up_room

User = get_user_model()


class StakeLadderTests(TestCase):
    """The rungs, and what it costs to stand on one."""

    def test_every_stake_asks_for_fifty_blinds_and_allows_a_hundred(self):
        """The floor is half a full stack, not a fifth of one: a table where
        somebody can sit down with ten blinds is a table everybody else has to
        play differently."""
        for stake in STAKES:
            with self.subTest(stake=stake.key):
                self.assertEqual(stake.min_buy_in, stake.big_blind * 50)
                self.assertEqual(stake.max_buy_in, stake.big_blind * 100)
                self.assertLess(stake.small_blind, stake.big_blind)

    def test_the_ladder_climbs_and_never_repeats(self):
        blinds = [one.big_blind for one in STAKES]
        self.assertEqual(blinds, sorted(blinds))
        self.assertEqual(len(set(blinds)), len(blinds))

    def test_a_buy_in_has_to_be_between_the_two(self):
        stake = stake_for("low")

        self.assertEqual(clean_buy_in(stake, 300), 300)
        self.assertIsInstance(clean_buy_in(stake, 200), str)
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

        self.assertEqual(top_up_room(stake, 250), 250)
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
        seat = sit_down(self.table, self.user, 300, seat_number=0)

        self.assertIsInstance(seat, CashSeat)
        self.assertEqual(seat.stack, 300)
        self.assertEqual(self._balance(), 700)
        # And the two still add up to what they had.
        self.assertEqual(self._balance() + seat.stack, 1000)

    def test_standing_up_brings_the_whole_stack_back(self):
        seat = sit_down(self.table, self.user, 300, seat_number=0)
        CashSeat.objects.filter(pk=seat.pk).update(stack=340)   # they won some
        seat.refresh_from_db()

        paid = stand_up(seat)

        self.assertEqual(paid, 340)
        self.assertEqual(self._balance(), 1040)
        self.assertFalse(CashSeat.objects.filter(pk=seat.pk).exists())

    def test_a_stack_lost_at_the_table_is_a_stack_lost(self):
        seat = sit_down(self.table, self.user, 300, seat_number=0)
        CashSeat.objects.filter(pk=seat.pk).update(stack=0)
        seat.refresh_from_db()

        stand_up(seat)

        self.assertEqual(self._balance(), 700)

    def test_every_move_is_written_down(self):
        seat = sit_down(self.table, self.user, 300, seat_number=0)
        stand_up(seat)

        rows = CoinLedger.objects.filter(user=self.user, memo=f"cash:{self.table.id}")
        self.assertEqual(sorted(row.amount for row in rows), [-300, 300])

    def test_you_cannot_sit_at_the_same_table_twice(self):
        sit_down(self.table, self.user, 300, seat_number=0)

        again = sit_down(self.table, self.user, 300, seat_number=1)

        self.assertIsInstance(again, str)
        self.assertEqual(CashSeat.objects.filter(table=self.table).count(), 1)
        self.assertEqual(self._balance(), 700)

    def test_two_people_cannot_have_one_chair(self):
        other = User.objects.create_user(username="cash_two", password="secret123")
        wallet_for(other)
        Wallet.objects.filter(user=other).update(balance=1000)
        sit_down(self.table, self.user, 300, seat_number=0)

        clash = sit_down(self.table, other, 300, seat_number=0)

        self.assertIsInstance(clash, str)
        self.assertEqual(Wallet.objects.get(user=other).balance, 1000)

    def test_an_empty_wallet_sits_at_nothing(self):
        Wallet.objects.filter(user=self.user).update(balance=10)

        refused = sit_down(self.table, self.user, 300, seat_number=0)

        self.assertIsInstance(refused, str)
        self.assertFalse(CashSeat.objects.exists())

    def test_a_closed_table_takes_nobody(self):
        self.table.is_open = False
        self.table.save(update_fields=["is_open"])

        self.assertIsInstance(sit_down(self.table, self.user, 300, seat_number=0), str)

    def test_topping_up_adds_to_the_stack_and_takes_from_the_wallet(self):
        seat = sit_down(self.table, self.user, 300, seat_number=0)

        topped = top_up(seat, 100)

        self.assertEqual(topped.stack, 400)
        self.assertEqual(topped.bought_in, 400)
        self.assertEqual(self._balance(), 600)

    def test_topping_up_past_the_table_maximum_is_refused(self):
        seat = sit_down(self.table, self.user, 500, seat_number=0)   # already the cap

        self.assertIsInstance(top_up(seat, 100), str)
        self.assertEqual(self._balance(), 500)

    def test_closing_a_table_pays_everybody_back(self):
        other = User.objects.create_user(username="cash_three", password="secret123")
        wallet_for(other)
        Wallet.objects.filter(user=other).update(balance=1000)
        sit_down(self.table, self.user, 300, seat_number=0)
        sit_down(self.table, other, 300, seat_number=1)

        paid = cash_out_everybody(self.table)

        self.assertEqual(paid, 600)
        self.assertEqual(self._balance(), 1000)
        self.assertEqual(Wallet.objects.get(user=other).balance, 1000)
        self.assertFalse(CashSeat.objects.filter(table=self.table).exists())

    def test_the_coins_are_never_anywhere_but_the_wallet_or_the_felt(self):
        """The whole invariant, walked: sit, top up, win some, leave."""
        seat = sit_down(self.table, self.user, 300, seat_number=0)
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

    def test_the_snapshot_carries_the_faces_it_was_given(self):
        """The felt draws the same seat a tournament does, off the same three
        fields. Passed through rather than looked up: the seats arrive with the
        faces already on them."""
        room = self._room([
            dict(self._seat(0), avatar="\U0001F984", avatar_border="gold",
                 avatar_url="/api/auth/avatar/7/?v=1"),
            self._seat(1),
        ])
        room.seats = [dict(one) for one in self.seats]

        drawn = room.snapshot()["players"]

        self.assertEqual(drawn[0]["avatar"], "\U0001F984")
        self.assertEqual(drawn[0]["avatar_border"], "gold")
        self.assertEqual(drawn[0]["avatar_url"], "/api/auth/avatar/7/?v=1")
        # And a seat with nothing chosen still has something to draw.
        self.assertEqual(drawn[1]["avatar"], "\U0001F0CF")
        self.assertEqual(drawn[1]["avatar_border"], "")
        self.assertIsNone(drawn[1]["avatar_url"])

    def test_a_hand_opens_by_saying_who_is_sitting_at_the_table(self):
        """A seat that filled between hands is invisible otherwise: nothing
        else on the wire carries the seats, so somebody who sat down mid-session
        was not there for anybody until they reloaded."""
        room = self._room([self._seat(0), self._seat(1)])
        room.seats = [dict(one) for one in self.seats]

        async_to_sync(room.play_hand)()

        first = self.events[0]
        self.assertEqual(first[0], "cash_state")
        self.assertEqual([one["seat"] for one in first[1]["players"]], [0, 1])
        # Before a card is dealt, which is the only moment it is safe: a
        # snapshot of the seats has no bets or cards in it.
        kinds = [one[0] for one in self.events]
        self.assertLess(kinds.index("cash_state"), kinds.index("hole_cards_dealt"))

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

    def _mine(self, response):
        """This test's own table, out of a lobby that also has the app's."""
        return next(one for one in response.data["tables"] if one["id"] == self.table.id)

    def test_the_lobby_lists_the_ladder_and_the_open_tables(self):
        response = self.client.get(reverse("cash-lobby"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["stakes"]), 5)
        # The app's own tables are in there too — see PublicTablesTests.
        self.assertGreaterEqual(len(response.data["tables"]), 3)
        row = self._mine(response)
        self.assertEqual(row["stake_label"], "2/5")
        self.assertEqual(row["min_buy_in"], 250)
        self.assertEqual(row["max_buy_in"], 500)
        self.assertIsNone(row["my_seat"])

    def test_a_closed_table_is_not_in_the_lobby(self):
        CashTable.objects.filter(pk=self.table.pk).update(is_open=False)

        listed = self.client.get(reverse("cash-lobby")).data["tables"]

        self.assertNotIn(self.table.id, [one["id"] for one in listed])

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

    def test_a_seated_player_is_listed_with_the_face_they_chose(self):
        """A row of identical default cards tells you the seats are taken and
        nothing else, which is what the lobby was drawing: the faces were never
        in the payload, so every player looked like every other one."""
        from accounts.models import Profile

        Profile.objects.update_or_create(
            user=self.player, defaults={"avatar_emoji": "\U0001F984", "avatar_border": "gold"},
        )
        self.client.post(reverse("cash-sit", args=[self.table.id]), {"buy_in": 300}, format="json")

        row = next(
            one for one in self.client.get(reverse("cash-lobby")).data["tables"]
            if one["id"] == self.table.id
        )

        self.assertEqual(row["players"][0]["avatar_emoji"], "\U0001F984")
        self.assertEqual(row["players"][0]["avatar_border"], "gold")
        # No picture uploaded, so there is nothing to point at — and the emoji
        # above is what the seat falls back to.
        self.assertIsNone(row["players"][0]["avatar_url"])

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

    def test_staff_of_a_club_can_open_one_too(self):
        """The club page offers the button off can_manage, which is this same
        predicate. Owner and staff both organise; only the page had to be told.
        """
        from clubs.models import Club, Membership

        club = Club.objects.create(name="Quinta", created_by=self.staff)
        Membership.objects.create(club=club, user=self.player, role=Membership.STAFF)

        response = self.client.post(
            reverse("cash-open"), {"stake": "low", "club": club.slug}, format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

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


class CashRoomLiveTests(TransactionTestCase):
    """A hand played at a real table, with the real rows underneath it.

    The room's callbacks are the ones the app uses — seats read from the
    database, stacks written back to it, leavers paid out of it — so what is
    being checked here is the thing every other test takes on trust: that a
    hand of cash poker moves coins between wallets and invents none.
    """

    def setUp(self):
        self.players = []
        for index in range(3):
            user = User.objects.create_user(username=f"live_{index}", password="secret123")
            wallet_for(user)
            Wallet.objects.filter(user=user).update(balance=1000)
            self.players.append(user)
        self.table = CashTable.objects.create(name="Live", stake="low", seat_count=6)
        for index, user in enumerate(self.players):
            sit_down(self.table, user, 300, seat_number=index)

    def _room(self, **options):
        from cash.live import _load_seats, _persist_stacks, _record_hand, _settle_leavers
        from cash.room import CashRoom
        from cash.stakes import stake_for

        async def request_action(player, context):
            valid = context["valid_actions"]
            return ("check", 0) if "check" in valid else ("call", 0)

        async def broadcast(event_type, payload):
            return None

        table_id = self.table.id
        return CashRoom(
            table_id=table_id,
            stake=stake_for(self.table.stake),
            seat_count=self.table.seat_count,
            load_seats=lambda: _load_seats(table_id),
            persist_stacks=lambda stacks: _persist_stacks(table_id, stacks),
            settle_leavers=lambda: _settle_leavers(table_id),
            broadcast=broadcast,
            request_action=request_action,
            record_hand=lambda row: _record_hand(table_id, row),
            pause_between_hands=0,
            idle_poll=0,
            **options,
        )

    def _total_coins(self):
        wallets = sum(Wallet.objects.get(user=user).balance for user in self.players)
        felt = sum(CashSeat.objects.filter(table=self.table).values_list("stack", flat=True))
        return wallets + felt

    def _play(self, room, hands=1):
        async def go():
            for _ in range(hands):
                room.seats = await room.load_seats()
                await room.play_hand()

        async_to_sync(go)()

    def test_a_hand_moves_coins_between_stacks_and_creates_none(self):
        room = self._room()
        before = self._total_coins()

        self._play(room)

        self.assertEqual(self._total_coins(), before)
        self.assertEqual(self._total_coins(), 3 * 1000)

    def test_the_stacks_are_written_to_the_rows_rather_than_held_in_memory(self):
        """A stack that only exists in the process is a stack a restart turns
        into somebody's loss."""
        room = self._room()

        self._play(room)

        stacks = list(CashSeat.objects.filter(table=self.table).values_list("stack", flat=True))
        self.assertEqual(sum(stacks), 900)
        # Somebody won the blinds, so they are not all still 300.
        self.assertNotEqual(set(stacks), {300})

    def test_the_hand_is_written_to_the_history(self):
        room = self._room()

        self._play(room)

        hand = CashHand.objects.get()
        self.assertEqual(hand.table_id, self.table.id)
        self.assertGreater(hand.pot, 0)
        self.assertEqual(len(hand.boards), 1)
        self.table.refresh_from_db()
        self.assertEqual(self.table.hands_played, 1)

    def test_a_bomb_pot_table_deals_two_boards_and_still_adds_up(self):
        room = self._room(bomb_pot_every=1, bomb_pot_bb=2)

        self._play(room)

        hand = CashHand.objects.get()
        self.assertTrue(hand.was_bomb_pot)
        self.assertEqual(len(hand.boards), 2)
        self.assertEqual(self._total_coins(), 3 * 1000)

    def test_leaving_mid_hand_pays_out_once_the_hand_ends(self):
        room = self._room()
        seat = CashSeat.objects.get(table=self.table, user=self.players[2])
        CashSeat.objects.filter(pk=seat.pk).update(leaving=True, sitting_out=True)

        self._play(room)

        self.assertFalse(CashSeat.objects.filter(pk=seat.pk).exists())
        # They left with exactly what was in front of them, and the coins still
        # add up across everybody.
        self.assertEqual(Wallet.objects.get(user=self.players[2]).balance, 1000)
        self.assertEqual(self._total_coins(), 3 * 1000)

    def test_a_player_who_runs_out_is_sat_out_rather_than_removed(self):
        """In a cash game nought chips is somebody reaching for their wallet."""
        room = self._room()
        seat = CashSeat.objects.get(table=self.table, user=self.players[1])
        CashSeat.objects.filter(pk=seat.pk).update(stack=0)

        self._play(room)

        seat.refresh_from_db()
        self.assertTrue(seat.sitting_out)
        self.assertEqual(seat.stack, 0)

    def test_several_hands_in_a_row_keep_the_table_whole(self):
        room = self._room()

        self._play(room, hands=5)

        self.assertEqual(self._total_coins(), 3 * 1000)
        self.assertEqual(CashHand.objects.count(), 5)
        self.assertEqual(room.hand_number, 5)


class PublicTablesTests(TestCase):
    """The tables the app runs itself.

    A cash lobby with nothing in it is one nobody comes back to: somebody has to
    be first, and nobody wants to be first at an empty room they also had to
    open.
    """

    def test_the_app_keeps_a_table_at_each_of_the_first_four_rungs(self):
        """A ladder with a rung nobody can stand on is not a ladder: somebody
        who has won a few hundred at 1/2 has to have somewhere to take them.

        The top rung is not one of them. 25/50 is a big game, and a big game
        with nobody in it is worse than no table at all — a club can open one
        when a club has the players for it.
        """
        house = CashTable.objects.filter(club__isnull=True, is_open=True)

        self.assertGreaterEqual(house.count(), 4)
        self.assertEqual(
            {table.stake for table in house},
            {"micro", "low", "mid", "high"},
        )
        self.assertEqual(
            sorted(stake_for(table.stake).label for table in house),
            ["1/2", "10/20", "2/5", "5/10"],
        )

    def test_they_are_named_by_their_blinds(self):
        """Which is what a cash table is called everywhere outside this
        codebase. "micro" is how the code groups them, not how anybody asks
        for one."""
        for table in CashTable.objects.filter(club__isnull=True):
            with self.subTest(table=table.name):
                self.assertIn(stake_for(table.stake).label, table.name)

    def test_they_are_eight_handed(self):
        for table in CashTable.objects.filter(club__isnull=True):
            with self.subTest(table=table.name):
                self.assertEqual(table.seat_count, 8)

    def test_they_are_at_stakes_the_daily_coins_reach(self):
        """A table you can sit at with what you have is the only kind that
        fills. Two hundred a day has to be a session at the cheapest of them."""
        from sidegames.economy import DAILY_COINS

        from .stakes import stake_for

        cheapest = min(
            stake_for(table.stake).min_buy_in
            for table in CashTable.objects.filter(club__isnull=True)
        )
        self.assertLessEqual(cheapest, DAILY_COINS)

    def test_the_house_tables_run_the_ordinary_game(self):
        """A bomb pot every ten hands is a house rule, and a house rule belongs
        in somebody's club rather than on the app's own felt."""
        for table in CashTable.objects.filter(club__isnull=True):
            with self.subTest(table=table.name):
                self.assertEqual(table.bomb_pot_every, 0)
                self.assertFalse(table.run_it_twice)

    def test_eight_is_a_seat_count_a_club_can_ask_for(self):
        from .stakes import SEAT_CHOICES, clean_seats

        self.assertIn(8, SEAT_CHOICES)
        self.assertEqual(clean_seats(8), 8)


class CashSocketTests(TransactionTestCase):
    """The socket a seat listens on, and the thing that was closing it.

    Every broadcast in the app is group_send'd under the name `game.message`,
    and Channels dispatches that by looking for a method of that name on the
    consumer. A consumer without one does not ignore the message — it raises,
    and the socket dies. A table with nobody to deal to announces itself every
    two seconds, so an empty cash table was killing every socket at it on a
    loop, and the player saw a connection that would not stay up.
    """

    def setUp(self):
        self.user = User.objects.create_user(username="socket_ana", password="secret123")
        wallet_for(self.user)
        Wallet.objects.filter(user=self.user).update(balance=1000)
        self.table = CashTable.objects.create(name="Socket", stake="micro", seat_count=6)
        sit_down(self.table, self.user, 200, seat_number=0)

    def _socket(self, user=None):
        from channels.testing import WebsocketCommunicator

        from .consumers import CashTableConsumer

        socket = WebsocketCommunicator(
            CashTableConsumer.as_asgi(), f"/ws/cash/{self.table.id}/",
        )
        socket.scope["user"] = user or self.user
        socket.scope["url_route"] = {"kwargs": {"table_id": str(self.table.id)}}
        return socket

    def test_a_seat_filling_reaches_everybody_already_at_the_table(self):
        """Sitting down happens over REST, so nothing about it is on the wire
        unless the table says so. Without this, a player who joined mid-session
        was invisible to everybody there until the next hand — or, at a table
        waiting for that second player, forever."""
        from asgiref.sync import sync_to_async

        from .live import announce_seats, stop_room

        other = User.objects.create_user(username="socket_bea", password="secret123")
        wallet_for(other)
        Wallet.objects.filter(user=other).update(balance=1000)

        async def scenario():
            socket = self._socket()
            await socket.connect()
            await socket.receive_json_from(timeout=2)          # the snapshot

            await sync_to_async(sit_down)(self.table, other, 200, seat_number=3)
            told = await sync_to_async(announce_seats)(self.table.id)

            seen = None
            for _ in range(20):
                message = await socket.receive_json_from(timeout=2)
                if message.get("type") == "cash_state":
                    seen = message
                    break
            await socket.disconnect()
            return told, seen

        try:
            told, seen = async_to_sync(scenario)()
        finally:
            stop_room(self.table.id)

        self.assertTrue(told)
        self.assertIsNotNone(seen)
        self.assertEqual(sorted(one["seat"] for one in seen["players"]), [0, 3])

    def test_a_broadcast_reaches_the_seat_and_leaves_the_socket_up(self):
        from game.consumers import _broadcast_table

        from .live import room_id, stop_room

        async def scenario():
            socket = self._socket()
            connected, _ = await socket.connect()
            self.assertTrue(connected)
            # The snapshot the consumer sends on arrival.
            await socket.receive_json_from(timeout=2)

            await _broadcast_table(room_id(self.table.id), 1, "table_waiting", {"seated": 1})
            first = await socket.receive_json_from(timeout=2)

            # And again: the point is not that one arrives, it is that the
            # socket is still there for the next one.
            await _broadcast_table(room_id(self.table.id), 1, "table_waiting", {"seated": 1})
            second = await socket.receive_json_from(timeout=2)

            await socket.disconnect()
            return first, second

        try:
            first, second = async_to_sync(scenario)()
        finally:
            stop_room(self.table.id)

        self.assertEqual(first["type"], "table_waiting")
        self.assertEqual(second["type"], "table_waiting")
        self.assertEqual(first["seated"], 1)


class SeatChoiceTests(APITestCase):
    """Picking the chair rather than being given one.

    Where you sit is not decoration: it is who acts before you, and at a
    six-handed table it is most of what the seat is worth. The server already
    took a seat number; what it did not do was answer sensibly when the number
    was nonsense or when somebody else got there first.
    """

    def setUp(self):
        self.player = User.objects.create_user(username="chair_ana", password="secret123")
        wallet_for(self.player)
        Wallet.objects.filter(user=self.player).update(balance=2000)
        self.table = CashTable.objects.create(name="Chairs", stake="low", seat_count=6)
        self.client.force_authenticate(self.player)

    def _sit(self, **payload):
        return self.client.post(reverse("cash-sit", args=[self.table.id]), payload, format="json")

    def test_the_seat_asked_for_is_the_seat_given(self):
        response = self._sit(buy_in=300, seat=4)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["seat"], 4)

    def test_no_seat_asked_for_still_takes_the_first_free_one(self):
        response = self._sit(buy_in=300)

        self.assertEqual(response.data["seat"], 0)

    def test_a_seat_that_is_not_at_this_table_is_refused(self):
        for asked in (9, -1):
            with self.subTest(seat=asked):
                response = self._sit(buy_in=300, seat=asked)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(CashSeat.objects.exists())

    def test_a_seat_that_is_not_a_number_is_refused_rather_than_crashing(self):
        response = self._sit(buy_in=300, seat="middle")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Wallet.objects.get(user=self.player).balance, 2000)

    def test_a_seat_somebody_just_took_says_so(self):
        other = User.objects.create_user(username="chair_bea", password="secret123")
        wallet_for(other)
        Wallet.objects.filter(user=other).update(balance=2000)
        sit_down(self.table, other, 300, seat_number=2)

        response = self._sit(buy_in=300, seat=2)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("took that seat", response.data["error"])
        self.assertEqual(Wallet.objects.get(user=self.player).balance, 2000)


class CashCardPrivacyTests(TransactionTestCase):
    """Whose cards reach whom.

    The engine deals every hand's hole cards in one payload and leaves the
    delivery to whatever is driving it. A tournament's coordinator takes that
    apart and posts each player their own; a cash table had nothing doing it,
    so the whole table's cards were going to every seat at it. No client drew
    them, which is what made it easy to miss and no less of a leak — they were
    in the message, and reading somebody's hand needs no more than the console.

    With a rail watching, the same events reach people who are not in the hand
    at all, so this is the test the watching feature rests on.
    """

    def setUp(self):
        self.ana = User.objects.create_user(username="priv_ana", password="secret123")
        self.bea = User.objects.create_user(username="priv_bea", password="secret123")
        self.rail = User.objects.create_user(username="priv_rail", password="secret123")
        for user in (self.ana, self.bea, self.rail):
            wallet_for(user)
            Wallet.objects.filter(user=user).update(balance=1000)
        self.table = CashTable.objects.create(name="Private", stake="micro", seat_count=6)
        sit_down(self.table, self.ana, 200, seat_number=0)
        sit_down(self.table, self.bea, 200, seat_number=1)
        # Sat out, so the room these sockets boot has nobody to deal to and the
        # only events on the wire are the ones this test puts there.
        CashSeat.objects.filter(table=self.table).update(sitting_out=True)

    def _socket(self, user):
        from channels.testing import WebsocketCommunicator

        from .consumers import CashTableConsumer

        socket = WebsocketCommunicator(
            CashTableConsumer.as_asgi(), f"/ws/cash/{self.table.id}/",
        )
        socket.scope["user"] = user
        socket.scope["url_route"] = {"kwargs": {"table_id": str(self.table.id)}}
        return socket

    async def _next(self, socket, wanted, tries=20):
        """The next message of this kind, past the table's own waiting chatter."""
        for _ in range(tries):
            message = await socket.receive_json_from(timeout=2)
            if message.get("type") == wanted:
                return message
        raise AssertionError(f"no {wanted} arrived")

    async def _never(self, socket, unwanted, tries=6):
        """That none of these turn up, however much else does."""
        for _ in range(tries):
            if await socket.receive_nothing(timeout=0.2):
                continue
            message = await socket.receive_json_from(timeout=2)
            if message.get("type") in unwanted:
                return False
        return True

    def test_each_player_is_sent_their_own_cards_and_nobody_else_s(self):
        from .live import running_room, stop_room

        dealt = {
            "players": [
                {"seat": 0, "user_id": self.ana.id, "cards": ["As", "Ks"]},
                {"seat": 1, "user_id": self.bea.id, "cards": ["2c", "7d"]},
            ],
        }

        async def scenario():
            ana, bea, rail = (
                self._socket(self.ana), self._socket(self.bea), self._socket(self.rail),
            )
            for socket in (ana, bea, rail):
                connected, _ = await socket.connect()
                self.assertTrue(connected)
                await socket.receive_json_from(timeout=2)      # the snapshot

            # Through the room's own broadcast, which is the wiring under
            # test: the split has to be what a hand actually goes through, not
            # something a test reaches past it to call.
            await running_room(self.table.id).broadcast("hole_cards_dealt", dealt)

            hers = await self._next(ana, "hole_cards")
            his = await self._next(bea, "hole_cards")
            # The rail is in the same group and gets everything public. This is
            # not public, so there is nothing here for it.
            # Both names: the leak was the engine's own event reaching the
            # group intact, so it is not enough to check for the private one.
            watched = await self._never(rail, ("hole_cards", "hole_cards_dealt"))

            for socket in (ana, bea, rail):
                await socket.disconnect()
            return hers, his, watched

        try:
            hers, his, watched = async_to_sync(scenario)()
        finally:
            stop_room(self.table.id)

        self.assertEqual(hers, {"type": "hole_cards", "cards": ["As", "Ks"]})
        self.assertEqual(his, {"type": "hole_cards", "cards": ["2c", "7d"]})
        self.assertTrue(watched)

    def test_the_public_events_do_reach_the_rail(self):
        """Watching has to be worth doing: everything that is not a hole card
        is the same table everybody else is looking at."""
        from .live import running_room, stop_room

        async def scenario():
            rail = self._socket(self.rail)
            await rail.connect()
            await rail.receive_json_from(timeout=2)

            await running_room(self.table.id).broadcast(
                "street_dealt", {"street": "flop", "cards": ["As"]},
            )
            seen = await self._next(rail, "street_dealt")

            await rail.disconnect()
            return seen

        try:
            seen = async_to_sync(scenario)()
        finally:
            stop_room(self.table.id)

        self.assertEqual(seen["type"], "street_dealt")
        self.assertEqual(seen["street"], "flop")


class SeatAnnouncementTests(TestCase):
    """When the table may say who is sitting at it, and when it may not."""

    def test_a_table_mid_hand_is_left_alone(self):
        """A snapshot of the seats has no bets, no cards and no pot in it.
        Sending one while a hand is being played would wipe the hand off
        everybody's screen; the next hand opens with the same snapshot anyway.
        """
        from types import SimpleNamespace

        from cash import live

        live._rooms[9_999] = SimpleNamespace(_playing={0: object()}, snapshot=lambda rows: {})
        try:
            self.assertFalse(live.announce_seats(9_999))
        finally:
            live._rooms.pop(9_999, None)

    def test_a_table_nobody_is_looking_at_has_nobody_to_tell(self):
        from cash import live

        self.assertFalse(live.announce_seats(9_998))
