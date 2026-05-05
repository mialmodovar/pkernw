from django.db import models
from django.conf import settings


class Tournament(models.Model):
    STATUS_CHOICES = [
        ("lobby",    "Lobby"),
        ("running",  "Running"),
        ("finished", "Finished"),
    ]

    host           = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="hosted_tournaments")
    name           = models.CharField(max_length=100)
    status         = models.CharField(max_length=10, choices=STATUS_CHOICES, default="lobby")
    scheduled_start_at = models.DateTimeField(null=True, blank=True)
    starting_chips = models.IntegerField(default=10_000)
    max_players    = models.IntegerField(default=9)
    players_per_table = models.IntegerField(default=9)
    late_reg_level = models.IntegerField(default=4)    # late registration open through this level (0 = disabled)
    allow_rebuys   = models.BooleanField(default=True)
    max_rebuys     = models.IntegerField(default=2)    # per player
    rebuy_level    = models.IntegerField(default=4)    # rebuys allowed through this level (0 = disabled)
    created_at     = models.DateTimeField(auto_now_add=True)

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
