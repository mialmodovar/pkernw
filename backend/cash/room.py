"""The loop that keeps a cash table dealing.

A tournament's coordinator is a thing with an end: it seats a field, runs it
down to one player and settles. A cash table has neither of those. It deals a
hand, pays the pots, lets whoever wants to leave leave and whoever is waiting
sit down, and deals another — for as long as two people with chips are there to
be dealt to, and quietly waiting when they are not.

Everything it does to the world it does through callbacks handed in, the same
way the tournament coordinator does: this file has no ORM in it, so a whole
session can be played out in a test with dictionaries for seats.

The one rule that governs the shape of all of it: nothing about a seat changes
in the middle of a hand. Joins, leaves, top-ups and sit-outs are all read from
the database between hands and applied at once, because a stack that changed
while somebody was betting into it is a pot that cannot be settled.
"""

import asyncio
import time

from game import rabbithunt
from game.engine.hand import HandEngine
from game.engine.player import Player

from .seating import (
    MISSES_BEFORE_SITTING_OUT, absent, can_deal, dealable, is_bomb_pot,
    missed_the_clock, next_button,
)

# How long the table waits before looking again, when there is nobody to deal
# to. Long enough not to spin, short enough that somebody sitting down does not
# wonder whether the table is broken.
IDLE_POLL_SECONDS = 2.0

# The pause between hands. A cash table with no pause is unreadable — the pot
# from the hand you just lost is gone before you have seen who took it.
BETWEEN_HANDS_SECONDS = 3.0

# How long somebody has to act before the table acts for them.
ACTION_SECONDS = 20


class CashRoom:
    """One table, dealing."""

    def __init__(
        self,
        table_id,
        *,
        stake,
        seat_count,
        load_seats,
        persist_stacks,
        settle_leavers,
        broadcast,
        request_action,
        record_hand=None,
        mind_absent=None,
        sit_out=None,
        # Selling a look at the run-out: one wallet to charge, one socket to
        # show it to. Absent in a test, where the look is free — see
        # game/rabbithunt.py.
        take_rabbit_fee=None,
        notify_user=None,
        run_it_twice=False,
        bomb_pot_every=0,
        bomb_pot_bb=2,
        rabbit_hunting=True,
        pause_between_hands=BETWEEN_HANDS_SECONDS,
        idle_poll=IDLE_POLL_SECONDS,
        action_seconds=ACTION_SECONDS,
    ):
        self.table_id = table_id
        self.stake = stake
        self.seat_count = seat_count
        self.load_seats = load_seats
        self.persist_stacks = persist_stacks
        self.settle_leavers = settle_leavers
        self.broadcast = broadcast
        self.request_action = request_action
        self.record_hand = record_hand
        self.mind_absent = mind_absent
        self.sit_out = sit_out
        self.take_rabbit_fee = take_rabbit_fee
        self.notify_user = notify_user
        self.run_it_twice = run_it_twice
        self.bomb_pot_every = bomb_pot_every
        self.bomb_pot_bb = bomb_pot_bb
        self.rabbit_hunting = rabbit_hunting
        self.pause_between_hands = pause_between_hands
        self.idle_poll = idle_poll
        self.action_seconds = action_seconds

        self.hand_number = 0
        self.button = None
        self.running = False
        self.seats = []
        # The runtime players of the hand being dealt, by seat, so a socket can
        # find whoever it belongs to while a hand is in progress.
        self._playing = {}
        # Hands in a row somebody has let the clock run out on, by seat. Held
        # here rather than written down: it is about the last few minutes, and
        # a seat that goes and comes back starts again either way.
        self._missed = {}
        # Who has actually done something in the hand being dealt. A hand
        # counts as missed only if they never acted in it at all — timing out
        # on the river after betting the flop is a decision, and a slow one is
        # still a player.
        self._acted = set()
        # What was left in the deck when the last hand ended, and who has paid
        # to see it. None between the deal and the end of the hand.
        self._rabbit = None

    # ── the loop ─────────────────────────────────────────────────────────

    async def run(self):
        """Deal until somebody stops the table."""
        self.running = True
        try:
            while self.running:
                self.seats = await self.load_seats()
                # Before anything else, and between hands only: whoever has
                # stopped being at the table gets their coins back and their
                # chair given up. A stack nobody is behind is not a player.
                if await self._mind_the_absent():
                    self.seats = await self.load_seats()
                if not can_deal(self.seats):
                    await self._announce_waiting()
                    await asyncio.sleep(self.idle_poll)
                    continue
                await self.play_hand()
                await asyncio.sleep(self.pause_between_hands)
        finally:
            self.running = False

    async def _mind_the_absent(self):
        """Give up on the seats nobody is at. True if any of them went."""
        if self.mind_absent is None:
            return False
        gone = await self.mind_absent() or []
        for seat in gone:
            await self.broadcast("player_stood_up", {
                "seat": seat["seat"], "coins": seat.get("coins", 0), "reason": "away",
            })
        return bool(gone)

    def stop(self):
        self.running = False

    async def _announce_waiting(self):
        ready = dealable(self.seats)
        await self.broadcast("table_waiting", {
            "seated": len(self.seats),
            # Not "seated minus sitting out": a chair with nobody behind it is
            # not somebody to deal to either, and the felt should say so rather
            # than count two players and then not start.
            "dealable": len(ready),
            "away": sum(1 for one in self.seats if absent(one)),
            "seats": self.seat_count,
        })

    # ── one hand ─────────────────────────────────────────────────────────

    async def play_hand(self):
        """Deal one, pay it out, and write the stacks down."""
        self.hand_number += 1
        self.button = next_button(self.seats, self.button)

        # Who is here, before anything is dealt. A cash table's seats change
        # between hands and nothing else on the wire carries them, so without
        # this a player who sat down mid-session stayed invisible to everybody
        # already at the table until they happened to reload. Safe only here,
        # at the top of a hand: the snapshot is the seats, and sending it once
        # cards are out would talk over the hand in progress.
        await self.broadcast("cash_state", self.snapshot())

        playing = dealable(self.seats)
        players = [self._runtime(seat) for seat in playing]
        self._playing = {player._seat: player for player in players}
        # What everybody sat down to this hand with. The difference between
        # this and what they are left with is the whole result of a hand of
        # cash poker, and it cannot be worked out afterwards from the pot: a
        # player can win one and still be down on the hand.
        started_with = {player._seat: player.chips for player in players}
        self._acted = set()
        # Last hand's run-out is not for sale once these cards are out.
        self._rabbit = None

        dealer_index = next(
            (index for index, one in enumerate(playing) if one["seat"] == self.button), 0,
        )
        bomb = is_bomb_pot(self.hand_number, self.bomb_pot_every)

        engine = HandEngine(
            players=players,
            dealer_pos=dealer_index,
            small_blind=self.stake.small_blind,
            big_blind=self.stake.big_blind,
            ante=0,
            hand_number=self.hand_number,
            broadcast=self._hand_event,
            request_action=self._ask,
            rabbit_hunting_enabled=self.rabbit_hunting,
            run_it_twice=self.run_it_twice,
            bomb_pot_ante=self.stake.big_blind * self.bomb_pot_bb if bomb else 0,
        )
        result = await engine.run()

        # What everybody is left with, and the money question a cash table has
        # that a tournament does not: these numbers are coins, so they are
        # written down before anything else can happen to them.
        stacks = {player._seat: player.chips for player in players}
        await self.persist_stacks(stacks)

        if self.record_hand is not None:
            won = {}
            for player, amount, _description in result.pot_awards:
                won[player._seat] = won.get(player._seat, 0) + amount
            await self.record_hand({
                "hand_number": self.hand_number,
                "pot": sum(amount for _p, amount, _d in result.pot_awards),
                "awards": [
                    {"seat": player._seat, "user_id": player._user_id,
                     "amount": amount, "description": description}
                    for player, amount, description in result.pot_awards
                ],
                # One row per player, which is what makes "how did I do this
                # week" a question the record can answer.
                "seats": [
                    {
                        "seat": player._seat,
                        "user_id": player._user_id,
                        "net": player.chips - started_with[player._seat],
                        "won": won.get(player._seat, 0),
                    }
                    for player in players
                ],
                "boards": [[str(card) for card in board] for board in result.boards],
                "was_bomb_pot": bomb,
                "ran_twice": len(result.boards) > 1,
            })

        # And the seats that are done with: anybody who asked to leave, and
        # anybody whose stack is gone. Neither is a knockout — one is a player
        # walking out with their coins and the other is a player who has to
        # reach for their wallet.
        await self.settle_leavers()
        await self._sit_out_the_absent([player._seat for player in players])
        self._playing = {}
        return result

    async def _sit_out_the_absent(self, dealt_in):
        """Stop dealing to anybody who has not acted in two hands running.

        Counted by the hand rather than by the turn: a hand asks a player up to
        four times, and three of those going by is one absence, not three.
        """
        for seat in dealt_in:
            if seat in self._acted:
                self._missed.pop(seat, None)
            else:
                self._missed[seat] = self._missed.get(seat, 0) + 1

        gone = [
            seat for seat, misses in self._missed.items()
            if misses >= MISSES_BEFORE_SITTING_OUT
        ]
        if not gone:
            return
        for seat in gone:
            self._missed.pop(seat, None)
        if self.sit_out is not None:
            await self.sit_out(gone)
        for seat in gone:
            await self.broadcast("player_sitting_out", {"seat": seat, "value": True})

    def _runtime(self, seat):
        """One seated row, as the engine's idea of a player."""
        player = Player(name=seat.get("name") or f"seat {seat['seat']}", chips=seat["stack"])
        player._seat = seat["seat"]
        player._user_id = seat["user_id"]
        # The engine reads both of these off a player; a cash table has no time
        # bank and nobody is ever sitting out *in* a hand, since sitting out
        # means not being dealt in at all.
        player.time_bank_seconds_remaining = 0
        player.is_sitting_out = False
        return player

    async def _ask(self, player, context):
        """One decision, with the clock the table runs on.

        Timed, because the answer does not say whether anybody gave it: a fold
        arrives as a fold whether it was pressed or the clock ran out. Somebody
        who lets it run out twice in a row is not at the table, whatever their
        socket says, and the table stops dealing them in before it costs them
        another blind.
        """
        started = time.monotonic()
        answer = await self.request_action(
            player, {**context, "action_timer_seconds": self.action_seconds},
        )
        if not missed_the_clock(time.monotonic() - started, self.action_seconds):
            self._acted.add(player._seat)
        return answer

    # ── what a socket needs ──────────────────────────────────────────────

    async def _hand_event(self, event_type, payload):
        """Every event the engine emits, on its way out to the table.

        One of them does not go out as it arrives: the cards that would have
        come are what rabbit hunting sells, so the table is told that there is
        something to see and what it costs, and the cards stay here. Same
        interception as the tournament coordinator's, for the same reason.
        """
        if event_type == "rabbit_hunt":
            self._rabbit = rabbithunt.open_book(
                payload.get("cards"), payload.get("would_complete_board"),
            )
            await self.broadcast("rabbit_hunt", rabbithunt.offer(self._rabbit))
            return
        await self.broadcast(event_type, payload)

    async def buy_rabbit_hunt(self, user_id, name=""):
        """Sell one look at what would have come.

        The cards to the buyer, the fact of it to everybody: somebody paying to
        find out is most of what rabbit hunting is at a table.
        """
        if not rabbithunt.may_buy(self._rabbit, user_id):
            return False

        balance = None
        if self.take_rabbit_fee is not None:
            balance = await self.take_rabbit_fee(user_id, rabbithunt.PRICE)
            if balance is None:
                return False   # not enough coins, and nothing has been shown

        # The last hand's seat: the offer only exists between hands, so this is
        # who they were when the cards it is about were dealt.
        player = self.player_at(user_id)
        row = rabbithunt.record(
            self._rabbit,
            user_id,
            name or getattr(player, "name", ""),
            getattr(player, "_seat", None),
        )
        if self.notify_user is not None:
            await self.notify_user(user_id, {
                "type": "rabbit_hunt_cards",
                "cards": list(self._rabbit["cards"]),
                "would_complete_board": list(self._rabbit["board"]),
                "balance": balance,
            })
        await self.broadcast("rabbit_hunt_taken", {
            **row,
            "price": rabbithunt.PRICE,
            "buyers": rabbithunt.buyers(self._rabbit),
        })
        return True

    def player_at(self, user_id):
        """The runtime player for this user, while a hand is in progress."""
        return next(
            (one for one in self._playing.values() if one._user_id == user_id), None,
        )

    def snapshot(self, seats=None):
        """What the table looks like right now, for somebody arriving.

        Built from the seats rather than from the hand, because a client that
        opens the page between hands has to see a table rather than nothing.
        """
        rows = seats if seats is not None else self.seats
        return {
            "type": "cash_state",
            "table_id": self.table_id,
            "hand_number": self.hand_number,
            "button": self.button,
            "seats": self.seat_count,
            "stake": {
                "small_blind": self.stake.small_blind,
                "big_blind": self.stake.big_blind,
            },
            # Whatever is still on offer between hands, so a client arriving in
            # the gap sees the same button and the same list of who paid.
            "rabbit_hunt": rabbithunt.offer(self._rabbit),
            "options": {
                "run_it_twice": self.run_it_twice,
                "bomb_pot_every": self.bomb_pot_every,
                "bomb_pot_bb": self.bomb_pot_bb,
            },
            "players": [
                {
                    "seat": one["seat"],
                    "user_id": one["user_id"],
                    "name": one.get("name") or "",
                    "chips": one["stack"],
                    "is_sitting_out": bool(one.get("sitting_out")),
                    "is_leaving": bool(one.get("leaving")),
                    # Passed through rather than looked up: the seats arrive
                    # with the faces on them, and the felt draws the same
                    # picture and ring a tournament would.
                    "avatar": one.get("avatar") or "\U0001F0CF",
                    "avatar_border": one.get("avatar_border") or "",
                    "avatar_url": one.get("avatar_url"),
                }
                for one in sorted(rows, key=lambda one: one["seat"])
            ],
        }
