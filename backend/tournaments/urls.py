from django.urls import path
from .spingo_views import (
    spingo_lobby,
    spingo_sit,
    spingo_leave,
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
    # and named apart from them, because a Spin n Go is not joined, started or
    # edited like a tournament is.
    path("spingo/",                spingo_lobby,                       name="spingo-lobby"),
    path("spingo/sit/",            spingo_sit,                         name="spingo-sit"),
    path("spingo/leave/",          spingo_leave,                       name="spingo-leave"),
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
