from django.urls import path

from .views import (
    club_detail,
    club_leaderboard,
    club_tournaments,
    clubs,
    create_league,
    join_by_code,
    join_club,
    league_detail,
    league_standings,
    leave_club,
    member,
    next_season,
    reset_invite_code,
    season_detail,
)

urlpatterns = [
    path("",                          clubs,            name="clubs"),
    path("join/",                     join_by_code,     name="club-join-by-code"),
    path("leagues/<int:league_id>/",   league_detail,    name="league-detail"),
    path("leagues/<int:league_id>/standings/", league_standings, name="league-standings"),
    path("leagues/<int:league_id>/seasons/",   next_season,      name="league-next-season"),
    path("seasons/<int:season_id>/",  season_detail,    name="season-detail"),
    path("<slug:slug>/",              club_detail,      name="club-detail"),
    path("<slug:slug>/join/",         join_club,        name="club-join"),
    path("<slug:slug>/leaderboard/",  club_leaderboard, name="club-leaderboard"),
    path("<slug:slug>/tournaments/",  club_tournaments, name="club-tournaments"),
    path("<slug:slug>/leave/",        leave_club,       name="club-leave"),
    path("<slug:slug>/invite-code/",  reset_invite_code, name="club-invite-code"),
    path("<slug:slug>/leagues/",      create_league,    name="club-create-league"),
    path("<slug:slug>/members/<str:username>/", member, name="club-member"),
]
