from django.conf import settings
from django.db import models
from django.utils import timezone


class Wallet(models.Model):
    """A player's coins.

    Its own currency, deliberately: coins buy nothing that money buys, and
    money buys no coins. The tournament ledger settles real debts between
    friends and must never be confused with a game of guessing who wins a pot.

    The balance is stored rather than summed from the ledger below — a wallet
    is read on every page and written in the middle of a hand — but every
    change writes a ledger row in the same transaction, so the two can always
    be checked against each other.
    """

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="wallet")
    balance = models.IntegerField(default=0)
    # When the daily was last taken. Null means never.
    last_claim_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username}: {self.balance} coins"


class CoinLedger(models.Model):
    """Every movement of coins, in and out, with the reason.

    Append-only. Nothing reads it to work out a balance in the ordinary way,
    but a balance that cannot be explained is a balance nobody trusts.
    """

    REASONS = [
        ("signup", "Opening balance"),
        ("daily", "Daily coins"),
        ("stake", "Side game stake"),
        ("payout", "Side game payout"),
        ("purchase", "Purchase"),
        ("refund", "Refund"),
        ("mission", "Mission reward"),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="coin_ledger")
    # Signed: what the balance moved by, so the rows add up to it.
    amount = models.IntegerField()
    reason = models.CharField(max_length=16, choices=REASONS)
    # Free text for the specifics — which game, which item.
    memo = models.CharField(max_length=120, blank=True, default="")
    balance_after = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.user.username} {self.amount:+d} ({self.reason})"


class Unlock(models.Model):
    """Something bought with coins and kept: a throwable, for now."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="unlocks")
    # Namespaced, so a future shelf of anything else cannot collide with the
    # throwables — "throwable:bomb".
    item = models.CharField(max_length=64)
    price_paid = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("user", "item")]

    def __str__(self):
        return f"{self.user.username} owns {self.item}"


class MissionClaim(models.Model):
    """A mission already paid for.

    The only thing missions store. Progress is read back out of the games
    themselves (see missiontally.py), so this row is the whole of the
    bookkeeping — and the unique constraint is the whole of the protection
    against paying one twice, including against two taps arriving together.

    `period` is a date: the day for a daily, the Monday for a weekly. Readable
    in the table without knowing the rules that produced it.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="mission_claims",
    )
    mission = models.CharField(max_length=32)
    period = models.CharField(max_length=16)
    coins = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "mission", "period"], name="one_claim_per_mission_period",
            ),
        ]
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.user.username} {self.mission} {self.period} (+{self.coins})"


class BlackjackRound(models.Model):
    """One round of blackjack, deck and all, on a single row.

    The deck is here, on the server, and it is the reason this is a row rather
    than something held in the client between requests. A blackjack round is a
    conversation — deal, hit, hit, stand — and every turn of it needs to know
    what the next card is without the player being able to find out. Shuffling
    fresh on each request would deal a different next card every time; sending
    the deck to the client and taking it back would be asking the player not to
    look. So the undealt cards live here, are never serialised into a response
    (see blackjack_views.round_payload, which builds the payload field by field
    for exactly this reason), and die with the round.

    The cards themselves are JSON rather than tables of their own, like
    Tournament.payout_structure next door: a round is written and read whole,
    nothing ever queries for "every hand containing an ace", and three more
    tables would buy nothing but joins. What the shapes are:

      deck    ["9s", "Kd", ...]   the undealt remainder, dealt from the front
      dealer  ["Kd", "7h"]        both cards, always; the hiding is done on the
                                  way out, never by leaving one unrecorded
      hands   [{cards, stake, doubled, from_split, status, outcome, returned}]

    `net` is stored rather than summed on demand because it is the one number
    the player actually reads — "+37" — and a finished round must go on saying
    the same thing tomorrow even if the payout arithmetic is ever changed.
    """

    STATUSES = [("playing", "In play"), ("finished", "Finished")]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="blackjack_rounds",
    )
    # The opening stake, per hand. A split hand and a doubled hand both carry
    # their own figure inside `hands`; this is what the round was sat down for.
    stake = models.IntegerField(default=0)
    deck = models.JSONField(default=list, blank=True)
    dealer = models.JSONField(default=list, blank=True)
    hands = models.JSONField(default=list, blank=True)
    # Which hand is being played. Null once the round is over, which is also how
    # the client knows to stop offering buttons.
    active = models.IntegerField(null=True, blank=True, default=0)
    status = models.CharField(max_length=10, choices=STATUSES, default="playing")
    # What the wallet moved by across the whole round: everything returned, less
    # everything staked, doubles and splits included.
    net = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            # One unfinished round per player, enforced by the database rather
            # than by looking first. Looking first is no guard at all here: two
            # taps on Deal arriving together both find nothing open, and
            # select_for_update cannot lock a row that neither of them has
            # written yet. Same reasoning as MissionClaim above — the constraint
            # decides, and the transaction rolls the loser back.
            models.UniqueConstraint(
                fields=["user"],
                condition=models.Q(status="playing"),
                name="one_open_blackjack_round",
            ),
        ]

    def __str__(self):
        return f"{self.user.username} blackjack #{self.id} ({self.status})"


class BlackjackTable(models.Model):
    """The shared table: one row, one clock, one deck, eight seats.

    A solo round is a conversation between one player and a deck, and it can
    live on a row that only moves when that player presses something. A shared
    table cannot: eight people are watching the same cards, and the thing they
    are all waiting for — the betting window closing, the dealer turning over —
    has to happen whether or not any particular one of them is looking.

    The obvious way to do that is a worker that ticks. This does not have one.
    The phase and the moment it ends are both stored here, and every request
    works out from `phase_ends_at` what phase the table *should* be in and walks
    it forward before answering — see blackjacktable.advance. A table nobody is
    looking at is not late, it is simply idle: the next person to open it does
    the walking, possibly through several phases at once, and everything that
    was owed gets paid at that moment rather than never.

    That is also why the deck is here rather than on the seats. There is one
    deck for the whole table and one dealer hand for the whole table, which is
    the entire point of the exercise — every seat settles against the same two
    cards, and a seat that kept its own deck would be eight solo games sitting
    near each other. As on BlackjackRound next door, the undealt remainder never
    leaves the server: blackjacktable_views builds the payload field by field so
    that the hole card and the rest of the shoe cannot ride out on a response.

    `key` exists so this is a table rather than the table. Only "main" is served
    today, but a second row is a second table with its own clock, and every memo
    written for money carries the table id for exactly that reason.
    """

    BETTING = "betting"
    PLAYING = "playing"
    SETTLING = "settling"
    PHASES = [(BETTING, "Betting"), (PLAYING, "Playing"), (SETTLING, "Settling")]

    key = models.CharField(max_length=32, unique=True, default="main")
    phase = models.CharField(max_length=10, choices=PHASES, default=BETTING)
    # When the current window closes. Stored rather than derived from a start
    # time and a duration, because the durations differ per phase and because a
    # window that was restarted early — see advance — has no start worth keeping.
    #
    # It defaults to *now*, which means a table that has just been created is
    # already expired and the first request to touch it opens a proper betting
    # window. One less special case than a nullable column that every reader
    # would have to test for.
    phase_ends_at = models.DateTimeField(default=timezone.now)
    # Rounds dealt, ever. The client needs it to tell one round's cards from the
    # next's — two consecutive hands of twenty against a dealer twenty look
    # identical otherwise — and the money memos are filed under it.
    round_number = models.IntegerField(default=0)
    deck = models.JSONField(default=list, blank=True)
    # Both dealer cards, always, from the moment they are dealt. The hiding is
    # done on the way out and never by leaving a card unrecorded, so that the
    # dealer's hand is one thing rather than one thing plus a promise.
    dealer = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"blackjack table {self.key} ({self.phase} #{self.round_number})"


class BlackjackSeat(models.Model):
    """One player's place at the shared table, and what they have on it.

    A row exists only while somebody is sitting in the seat: leaving deletes it,
    and the eight slots a client draws are made up from the rows that are there.
    That makes the two unique constraints below the whole of the seating rule,
    and they are constraints rather than checks because both of the things they
    forbid are races. Two people press seat 3 in the same tenth of a second, and
    the loser must be told the seat has gone rather than quietly sharing it.

    `hands` is a list because a split makes two of them, and it is exactly the
    solo game's shape — see BlackjackRound — so that blackjack.settle can be
    handed every hand at the table at once and settle all of them against the
    one dealer hand. There is no `active` column: hands are played in order and
    only ever leave "playing" for good, so the hand being played is the first
    one still playing and is worked out rather than stored, which is one fewer
    number that can disagree with the cards.

    `idle_rounds` is how a seat somebody has walked away from comes free again.
    Eight seats is few enough that holding one you are not playing is taking it
    from somebody who would.
    """

    table = models.ForeignKey(BlackjackTable, on_delete=models.CASCADE, related_name="seats")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="blackjack_seats",
    )
    seat = models.IntegerField()
    # The opening stake for this round, and zero between rounds. A doubled or
    # split hand carries its own larger figure inside `hands`; this is what the
    # seat sat down for, which is what the other seven players get to see.
    bet = models.IntegerField(default=0)
    hands = models.JSONField(default=list, blank=True)
    # What this round moved this seat's wallet by, once it has been settled.
    # Stored rather than summed on demand for the same reason BlackjackRound.net
    # is: it is the number the player actually reads.
    net = models.IntegerField(default=0)
    # Betting windows in a row that closed without a bet from this seat.
    idle_rounds = models.IntegerField(default=0)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["seat"]
        constraints = [
            models.UniqueConstraint(
                fields=["table", "seat"], name="one_player_per_blackjack_seat",
            ),
            # One seat each. Without it a player could sit twice and play two
            # hands against the dealer for the price of one seat's attention,
            # which is a different game from the one on offer.
            models.UniqueConstraint(
                fields=["table", "user"], name="one_blackjack_seat_per_player",
            ),
        ]

    def __str__(self):
        return f"{self.user.username} in seat {self.seat}"
