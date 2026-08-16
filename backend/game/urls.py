from django.urls import path

from .views import hand_detail, tournament_hands, tournament_player_stats

urlpatterns = [
    path("<int:pk>/hands/", tournament_hands, name="tournament-hands"),
    path("<int:pk>/player-stats/", tournament_player_stats, name="tournament-player-stats"),
    # Mounted under the tournaments prefix like the two above, but a hand id is
    # unique on its own — the tournament is on the hand.
    path("hands/<int:pk>/", hand_detail, name="hand-detail"),
]
