from django.conf import settings
from django.db import models


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
