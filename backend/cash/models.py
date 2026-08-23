"""A room with a table in it.

A tournament is an event: it starts, it ends, and every chip in it belongs to
the prize pool until it does. A cash table is a place — it has no beginning and
no end, people arrive and leave mid-session, and the chips in front of somebody
are their coins, exactly, at every moment.

That difference is the reason these are their own models rather than a flag on
Tournament. Almost nothing a tournament row carries means anything here: there
is no blind schedule, no finish position, no payout structure, no settlement.
What there is instead is a seat with a stack in it, and the rule that the stack
and the wallet always add up to what the player brought.
"""

from django.conf import settings
from django.db import models

from .stakes import DEFAULT_SEATS, SEAT_CHOICES, STAKES


class CashTable(models.Model):
    """One table, at one stake, for as long as anybody wants to sit at it."""

    STAKE_CHOICES = [(one.key, one.label) for one in STAKES]
    SEAT_COUNT_CHOICES = [(one, f"{one}-max") for one in SEAT_CHOICES]

    name = models.CharField(max_length=60)
    stake = models.CharField(max_length=12, choices=STAKE_CHOICES)
    # How many chairs there are. Named for the count rather than the chairs
    # themselves, which are the CashSeat rows on the other side of `taken`.
    seat_count = models.IntegerField(choices=SEAT_COUNT_CHOICES, default=DEFAULT_SEATS)

    # Null for the tables the app runs itself, which is most of them. A club's
    # table is listed on the club's page and closed by whoever runs the club.
    club = models.ForeignKey(
        "clubs.Club", on_delete=models.CASCADE, null=True, blank=True, related_name="cash_tables",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="cash_tables",
    )

    # How the hands are dealt. All of them are the table's rule rather than a
    # per-hand negotiation: a table that has to ask four people whether to run
    # it twice, with a clock running, is a table nobody plays at.
    run_it_twice = models.BooleanField(default=False)
    # Every Nth hand is a bomb pot: no preflop betting, everybody antes, two
    # boards. Zero is never, which is the default.
    bomb_pot_every = models.IntegerField(default=0)
    # What everybody puts in for one, as a multiple of the big blind.
    bomb_pot_bb = models.IntegerField(default=2)
    rabbit_hunting = models.BooleanField(default=True)

    # Shut by whoever opened it. The rows stay so the hands played at it still
    # have a table to point at.
    is_open = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    # Bumped when a hand finishes, so the lobby can put the busy tables first
    # without counting hands.
    last_hand_at = models.DateTimeField(null=True, blank=True)
    hands_played = models.IntegerField(default=0)

    class Meta:
        ordering = ["stake", "id"]

    def __str__(self):
        return f"{self.name} ({self.stake})"


class CashSeat(models.Model):
    """One player's chair, and the coins on the table in front of them.

    `stack` is the whole of it: coins that have left the wallet and are sitting
    on the felt. They come back when the player stands up, and until then they
    are neither in the wallet nor anywhere else — which is why every path that
    moves them is one transaction and why there is a test that adds the two up.
    """

    table = models.ForeignKey(CashTable, on_delete=models.CASCADE, related_name="taken")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cash_seats",
    )
    seat = models.IntegerField()
    stack = models.IntegerField(default=0)

    # Dealt out but still sitting there. Their own choice, or what happens to a
    # stack that reaches zero — in a cash game that is not a knockout, it is
    # somebody who has to reach for their wallet.
    sitting_out = models.BooleanField(default=False)
    # Asked to leave, and waiting for the hand they are in to finish. The seat
    # is given up and the stack paid out the moment it does.
    leaving = models.BooleanField(default=False)

    joined_at = models.DateTimeField(auto_now_add=True)
    # What they have brought to this seat in total, so a session's result is
    # readable without walking the ledger.
    bought_in = models.IntegerField(default=0)
    hands_dealt = models.IntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["table", "seat"], name="one_player_per_cash_seat"),
            models.UniqueConstraint(fields=["table", "user"], name="one_seat_per_player"),
        ]
        ordering = ["table_id", "seat"]

    def __str__(self):
        return f"{self.user.username} at {self.table_id} seat {self.seat} ({self.stack})"


class CashHand(models.Model):
    """A hand that was played, for the history and for the arithmetic.

    Kept deliberately thin: the whole hand is not replayed from here, the way a
    tournament's is — what a cash player asks afterwards is what a pot was and
    who took it.
    """

    table = models.ForeignKey(CashTable, on_delete=models.CASCADE, related_name="hands")
    hand_number = models.IntegerField()
    pot = models.IntegerField(default=0)
    # [{"user_id": 1, "amount": 240, "description": "Main pot: Flush"}]
    awards = models.JSONField(default=list, blank=True)
    boards = models.JSONField(default=list, blank=True)
    was_bomb_pot = models.BooleanField(default=False)
    ran_twice = models.BooleanField(default=False)
    played_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-played_at", "-id"]


class CashHandSeat(models.Model):
    """What one hand did to one player.

    A cash table's record is otherwise a row per hand, which answers "what was
    the pot" and cannot answer "how did I do last week" — the question every
    cash player actually asks, and the one a mission has to be able to read.

    Written from the same two numbers the room already has: what was in front
    of somebody when the hand started and what is there now. `net` is the
    difference, which is the whole result of a hand of cash poker, and `won` is
    what they took out of the pot, which is a different question — a player can
    win a pot and still be down on the hand.

    One row per dealt-in player per hand, in the same spirit as a tournament's
    action rows: counted from the record afterwards rather than tallied into a
    profile as it happens, so a number that looks wrong can be walked back to
    the hands it came from.
    """

    hand = models.ForeignKey(CashHand, on_delete=models.CASCADE, related_name="seats")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cash_hand_seats",
    )
    seat = models.IntegerField()
    # What the hand cost or paid, all in: blinds, calls and whatever came back.
    net = models.IntegerField(default=0)
    # What they took out of the pot, which is zero for everybody who lost it.
    won = models.IntegerField(default=0)
    # Denormalised off the hand so a week's play is one query with no join.
    # The hand it belongs to has the same moment on it.
    played_at = models.DateTimeField(db_index=True)

    class Meta:
        ordering = ["-played_at", "-id"]
        indexes = [models.Index(fields=["user", "played_at"])]

    def __str__(self):
        return f"{self.user_id} {self.net:+} on hand {self.hand_id}"
