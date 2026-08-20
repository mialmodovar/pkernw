from django.urls import path
from .fastgames_views import (
    fast_lobby,
    fast_sit,
    fast_leave,
)
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
    delete_tournament,
    update_tournament,
)

urlpatterns = [
    path("",                       TournamentListCreateView.as_view(), name="tournament-list"),
    # Before the <int:pk> routes below, which would otherwise never see these —
    # and named apart from them, because a game you sit down at is not joined,
    # started or edited the way a tournament is.
    path("fast/",                  fast_lobby,                         name="fast-lobby"),
    path("fast/sit/",              fast_sit,                           name="fast-sit"),
    path("fast/leave/",            fast_leave,                         name="fast-leave"),
    path("<int:pk>/",              TournamentDetailView.as_view(),     name="tournament-detail"),
    path("<int:pk>/join/",         join_tournament,                    name="tournament-join"),
    path("<int:pk>/start/",        start_tournament,                   name="tournament-start"),
    path("<int:pk>/pause/",        pause_tournament,                   name="tournament-pause"),
    path("<int:pk>/resume/",       resume_tournament,                  name="tournament-resume"),
    path("<int:pk>/skip-level/",   skip_blind_level,                   name="tournament-skip-level"),
    path("<int:pk>/levels/",       blind_levels,                       name="tournament-levels"),
    path("<int:pk>/rebuy/",        rebuy_tournament,                   name="tournament-rebuy"),
    path("<int:pk>/quit/",         quit_tournament,                    name="tournament-quit"),
    path("<int:pk>/edit/",         update_tournament,                  name="tournament-edit"),
    path("<int:pk>/delete/",       delete_tournament,                  name="tournament-delete"),
]
