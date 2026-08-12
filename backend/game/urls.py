from django.urls import path

from .views import tournament_hands, tournament_player_stats

urlpatterns = [
    path("<int:pk>/hands/", tournament_hands, name="tournament-hands"),
    path("<int:pk>/player-stats/", tournament_player_stats, name="tournament-player-stats"),
]
