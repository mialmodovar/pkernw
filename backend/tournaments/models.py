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
    starting_chips = models.IntegerField(default=10_000)
    max_players    = models.IntegerField(default=9)
    late_reg_level = models.IntegerField(default=4)    # late registration open through this level (0 = disabled)
    allow_rebuys   = models.BooleanField(default=True)
    max_rebuys     = models.IntegerField(default=2)    # per player
    rebuy_level    = models.IntegerField(default=4)    # rebuys allowed through this level (0 = disabled)
    created_at     = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.status})"


class BlindLevel(models.Model):
    tournament       = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name="levels")
    level_number     = models.IntegerField()
    small_blind      = models.IntegerField()
    big_blind        = models.IntegerField()
    ante             = models.IntegerField(default=0)
    duration_hands   = models.IntegerField(null=True, blank=True, default=8)
    duration_minutes = models.IntegerField(null=True, blank=True)

    class Meta:
        ordering = ["level_number"]

    def __str__(self):
        return f"Level {self.level_number}: {self.small_blind}/{self.big_blind}"


class TournamentPlayer(models.Model):
    tournament      = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name="players")
    user            = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tournament_seats")
    seat            = models.IntegerField()
    chips           = models.IntegerField()
    finish_position = models.IntegerField(null=True, blank=True)
    is_eliminated   = models.BooleanField(default=False)
    rebuy_count     = models.IntegerField(default=0)
    joined_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("tournament", "user"), ("tournament", "seat")]

    def __str__(self):
        return f"{self.user.username} @ seat {self.seat}"
