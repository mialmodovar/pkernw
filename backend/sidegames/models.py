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
