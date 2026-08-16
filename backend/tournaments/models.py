from django.db import models
from django.conf import settings


class Tournament(models.Model):
    STATUS_CHOICES = [
        ("lobby",    "Lobby"),
        ("running",  "Running"),
        ("paused",   "Paused"),
        ("finished", "Finished"),
    ]
    TIME_BANK_REFILL_CHOICES = [
        ("none",        "No refill"),
        ("hands",       "Every N hands"),
        ("blind_level", "At blind level"),
    ]
    # One game for now, named rather than assumed. A tournament that does not
    # say what it is played with is one that cannot be joined by anything else
    # later without guessing what the old rows meant.
    GAME_TYPE_CHOICES = [
        ("nlh", "No-Limit Hold'em"),
    ]
    BOUNTY_MODE_CHOICES = [
        ("none",        "No bounties"),
        ("fixed",       "Fixed knockout"),
        ("progressive", "Progressive knockout"),
    ]

    host           = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="hosted_tournaments")
    name           = models.CharField(max_length=100)
    game_type      = models.CharField(max_length=8, choices=GAME_TYPE_CHOICES, default="nlh")
    status         = models.CharField(max_length=10, choices=STATUS_CHOICES, default="lobby")
    scheduled_start_at = models.DateTimeField(null=True, blank=True)
    starting_chips = models.IntegerField(default=10_000)
    # In cents. The app never handles money; it only records what was agreed,
    # and a rounding error here is somebody's actual euro.
    buy_in_cents   = models.IntegerField(default=0)
    max_players    = models.IntegerField(default=9)
    # Eight, not nine. A full ring of nine is a lot of seats to read at once,
    # and on the felt it is the difference between a nameplate you can see and
    # one squeezed against its neighbours. Nine is still available for anyone
    # who wants it.
    players_per_table = models.IntegerField(default=8)
    late_reg_level = models.IntegerField(default=4)    # late registration open through this level (0 = disabled)
    allow_rebuys   = models.BooleanField(default=True)
    max_rebuys     = models.IntegerField(default=2)    # per player
    rebuy_level    = models.IntegerField(default=4)    # rebuys allowed through this level (0 = disabled)
    # On by default: without a bank, a moment's hesitation on a big decision
    # times you out into a fold. A fixed bank with no refill unless the creator
    # asks for one — the create form offers the refill rules.
    time_bank_seconds = models.IntegerField(default=30)
    time_bank_refill_rule = models.CharField(max_length=20, choices=TIME_BANK_REFILL_CHOICES, default="none")
    time_bank_refill_every_hands = models.IntegerField(null=True, blank=True)
    time_bank_refill_level = models.IntegerField(null=True, blank=True)
    payout_structure = models.JSONField(default=list, blank=True)
    # Bounties come out of the buy-in, they are not charged on top of it: a €20
    # buy-in with a €10 bounty pays €10 into the prize pool and puts €10 on the
    # player's head. Nobody has to work out what a "€20 + €20" tournament costs.
    bounty_mode    = models.CharField(max_length=12, choices=BOUNTY_MODE_CHOICES, default="none")
    bounty_cents   = models.IntegerField(default=0)   # per buy-in, the part that goes on a head
    # Progressive only: what share of a captured bounty is paid out in cash. The
    # rest goes onto the winner's own head, which is what makes it progressive.
    bounty_progressive_split_pct = models.IntegerField(default=50)
    # Matches the create form's default, so a tournament made anywhere else —
    # the admin, a shell — behaves like one made through the app.
    rabbit_hunting_enabled = models.BooleanField(default=True)
    # How long the table holds after a hand before the next deal. This is the
    # window in which cards can be shown, so it is also how long anybody has to
    # look at what was shown — a table that deals over a revealed card may as
    # well not offer showing at all.
    showdown_seconds = models.IntegerField(default=5)
    auto_remove_offline_seconds = models.IntegerField(default=0)
    # Blind progress, persisted so a restart resumes where play actually was
    # instead of rewinding the tournament to level 1.
    current_level_index = models.IntegerField(default=0)
    hands_in_level = models.IntegerField(default=0)
    created_at     = models.DateTimeField(auto_now_add=True)
    # When play actually began and ended, which created_at cannot stand in for:
    # a tournament made on Monday for Friday night was not four days long.
    started_at     = models.DateTimeField(null=True, blank=True)
    finished_at    = models.DateTimeField(null=True, blank=True)

    def required_table_count(self, player_count=None):
        total_players = self.players.count() if player_count is None else player_count
        total_players = max(total_players, 1)
        return ((total_players - 1) // self.players_per_table) + 1

    def ensure_table(self, table_number):
        table, _ = self.tables.get_or_create(
            table_number=table_number,
            defaults={"max_seats": self.players_per_table},
        )
        return table

    def __str__(self):
        return f"{self.name} ({self.status})"


class TournamentTable(models.Model):
    tournament   = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name="tables")
    table_number = models.IntegerField()
    max_seats    = models.IntegerField(default=9)
    is_active    = models.BooleanField(default=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["table_number"]
        unique_together = [("tournament", "table_number")]

    def __str__(self):
        return f"{self.tournament.name} - Table {self.table_number}"


class BlindLevel(models.Model):
    tournament       = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name="levels")
    level_number     = models.IntegerField()
    is_break         = models.BooleanField(default=False)
    small_blind      = models.IntegerField()
    big_blind        = models.IntegerField()
    ante             = models.IntegerField(default=0)
    duration_hands   = models.IntegerField(null=True, blank=True, default=8)
    duration_minutes = models.IntegerField(null=True, blank=True)

    class Meta:
        ordering = ["level_number"]

    def __str__(self):
        if self.is_break:
            return f"Break {self.level_number}"
        return f"Level {self.level_number}: {self.small_blind}/{self.big_blind}"


class TournamentPlayer(models.Model):
    tournament      = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name="players")
    user            = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tournament_seats")
    table           = models.ForeignKey(TournamentTable, on_delete=models.SET_NULL, null=True, blank=True, related_name="players")
    seat            = models.IntegerField()
    seat_at_table   = models.IntegerField(null=True, blank=True)
    chips           = models.IntegerField()
    finish_position = models.IntegerField(null=True, blank=True)
    is_eliminated   = models.BooleanField(default=False)
    rebuy_count     = models.IntegerField(default=0)
    # What sits on this player's head right now, and what they have already
    # collected off other people's. In a fixed-bounty game the first never
    # moves; in a progressive one it grows with every knockout.
    bounty_cents    = models.IntegerField(default=0)
    bounty_won_cents = models.IntegerField(default=0)
    knockouts       = models.IntegerField(default=0)
    time_bank_seconds_remaining = models.IntegerField(default=0)
    joined_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("tournament", "user"), ("tournament", "seat")]
        constraints = [
            models.UniqueConstraint(fields=["table", "seat_at_table"], name="unique_table_local_seat"),
        ]

    def __str__(self):
        if self.table_id is not None and self.seat_at_table is not None:
            return f"{self.user.username} @ table {self.table.table_number}, seat {self.seat_at_table}"
        return f"{self.user.username} @ seat {self.seat}"


class LedgerEntry(models.Model):
    """What one player put in and took out of one finished tournament."""

    tournament  = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name="ledger_entries")
    user        = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ledger_entries")
    stake_cents = models.IntegerField(default=0)   # buy-in plus rebuys
    prize_cents = models.IntegerField(default=0)   # everything they took home, bounties included
    # The part of prize_cents that came from knockouts rather than from placing.
    # Split out so the results can say where the money was won.
    bounty_prize_cents = models.IntegerField(default=0)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("tournament", "user")]

    @property
    def net_cents(self):
        return self.prize_cents - self.stake_cents

    def __str__(self):
        return f"{self.user.username} @ {self.tournament.name}: {self.net_cents}c"


class Settlement(models.Model):
    """A debt paid off, recorded by whoever received the money."""

    from_user  = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="settlements_paid")
    to_user    = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="settlements_received")
    amount_cents = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.from_user.username} paid {self.to_user.username} {self.amount_cents}c"
