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

from game.engine.hand import HandEngine
from game.engine.player import Player

from .seating import can_deal, dealable, is_bomb_pot, next_button

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
        run_it_twice=False,
        bomb_pot_every=0,
        bomb_pot_bb=2,
        rabbit_hunting=True,
        pause_between_hands=BETWEEN_HANDS_SECONDS,
        idle_poll=IDLE_POLL_SECONDS,
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
        self.run_it_twice = run_it_twice
        self.bomb_pot_every = bomb_pot_every
        self.bomb_pot_bb = bomb_pot_bb
        self.rabbit_hunting = rabbit_hunting
        self.pause_between_hands = pause_between_hands
        self.idle_poll = idle_poll

        self.hand_number = 0
        self.button = None
        self.running = False
        self.seats = []
        # The runtime players of the hand being dealt, by seat, so a socket can
        # find whoever it belongs to while a hand is in progress.
        self._playing = {}

    # ── the loop ─────────────────────────────────────────────────────────

    async def run(self):
        """Deal until somebody stops the table."""
        self.running = True
        try:
            while self.running:
                self.seats = await self.load_seats()
                if not can_deal(self.seats):
                    await self._announce_waiting()
                    await asyncio.sleep(self.idle_poll)
                    continue
                await self.play_hand()
                await asyncio.sleep(self.pause_between_hands)
        finally:
            self.running = False

    def stop(self):
        self.running = False

    async def _announce_waiting(self):
        await self.broadcast("table_waiting", {
            "seated": len(self.seats),
            "dealable": len(dealable(self.seats)),
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
            broadcast=self.broadcast,
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
            await self.record_hand({
                "hand_number": self.hand_number,
                "pot": sum(amount for _p, amount, _d in result.pot_awards),
                "awards": [
                    {"seat": player._seat, "user_id": player._user_id,
                     "amount": amount, "description": description}
                    for player, amount, description in result.pot_awards
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
        self._playing = {}
        return result

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
        """One decision, with the clock the table runs on."""
        return await self.request_action(player, {**context, "action_timer_seconds": ACTION_SECONDS})

    # ── what a socket needs ──────────────────────────────────────────────

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
                }
                for one in sorted(rows, key=lambda one: one["seat"])
            ],
        }
