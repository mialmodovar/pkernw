from django.db import models
from tournaments.models import Tournament, TournamentPlayer


class Hand(models.Model):
    STATUS_CHOICES = [
        ("preflop",  "Pre-flop"),
        ("flop",     "Flop"),
        ("turn",     "Turn"),
        ("river",    "River"),
        ("complete", "Complete"),
    ]

    tournament      = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name="hands")
    hand_number     = models.IntegerField()
    level_index     = models.IntegerField()
    dealer_seat     = models.IntegerField()
    community_cards = models.JSONField(default=list)
    pot_total       = models.IntegerField(default=0)
    # Showdown hands and pot awards, so a finished hand can be replayed without
    # having to re-derive who won what.
    result          = models.JSONField(default=dict, blank=True)
    status          = models.CharField(max_length=10, choices=STATUS_CHOICES, default="preflop")
    started_at      = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Hand #{self.hand_number} ({self.status})"


class HandAction(models.Model):
    ACTION_CHOICES = [
        ("fold",  "Fold"),
        ("check", "Check"),
        ("call",  "Call"),
        ("bet",   "Bet"),
        ("raise", "Raise"),
        ("blind", "Blind"),
        ("ante",  "Ante"),
    ]
    STREET_CHOICES = [
        ("preflop", "Pre-flop"),
        ("flop",    "Flop"),
        ("turn",    "Turn"),
        ("river",   "River"),
    ]

    hand       = models.ForeignKey(Hand, on_delete=models.CASCADE, related_name="actions")
    player     = models.ForeignKey(TournamentPlayer, on_delete=models.CASCADE)
    # The seat as it was for THIS hand. A player's seat_at_table changes when
    # tables rebalance, so position-based stats can't be derived from it later.
    seat       = models.IntegerField(null=True, blank=True)
    street     = models.CharField(max_length=10, choices=STREET_CHOICES)
    action     = models.CharField(max_length=10, choices=ACTION_CHOICES)
    amount     = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.player} {self.action} {self.amount}"
