from django.urls import path
from .views import (
    TournamentListCreateView,
    TournamentDetailView,
    join_tournament,
    start_tournament,
    pause_tournament,
    resume_tournament,
    skip_blind_level,
    blind_levels,
    rebuy_tournament,
    quit_tournament,
)

urlpatterns = [
    path("",                       TournamentListCreateView.as_view(), name="tournament-list"),
    path("<int:pk>/",              TournamentDetailView.as_view(),     name="tournament-detail"),
    path("<int:pk>/join/",         join_tournament,                    name="tournament-join"),
    path("<int:pk>/start/",        start_tournament,                   name="tournament-start"),
    path("<int:pk>/pause/",        pause_tournament,                   name="tournament-pause"),
    path("<int:pk>/resume/",       resume_tournament,                  name="tournament-resume"),
    path("<int:pk>/skip-level/",   skip_blind_level,                   name="tournament-skip-level"),
    path("<int:pk>/levels/",       blind_levels,                       name="tournament-levels"),
    path("<int:pk>/rebuy/",        rebuy_tournament,                   name="tournament-rebuy"),
    path("<int:pk>/quit/",         quit_tournament,                    name="tournament-quit"),
]
