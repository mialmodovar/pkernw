from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import (
    RegisterView, MeView, avatar_image, avatar_image_for_user, update_avatar,
    update_display_name, update_preferences, update_theme,
    recover_password, reset_recovery_code,
)
from .stats import my_stats, player_profile
from .watching import online_now, search_players, unwatch, watching

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/",    TokenObtainPairView.as_view(), name="token_obtain"),
    path("refresh/",  TokenRefreshView.as_view(), name="token_refresh"),
    path("me/",       MeView.as_view(), name="me"),
    path("me/avatar/", update_avatar, name="update_avatar"),
    path("me/display-name/", update_display_name, name="update_display_name"),
    path("me/avatar/image/", avatar_image, name="avatar_image"),
    # Read by <img src>, so it is addressed by user rather than by "me".
    path("avatar/<int:user_id>/", avatar_image_for_user, name="avatar_image_for_user"),
    path("me/theme/", update_theme, name="update_theme"),
    path("me/preferences/", update_preferences, name="update_preferences"),
    path("me/recovery-code/", reset_recovery_code, name="reset_recovery_code"),
    # Public, obviously: somebody who could log in would not be here.
    path("recover/", recover_password, name="recover_password"),
    path("players/search/", search_players, name="search_players"),
    path("me/stats/", my_stats, name="my_stats"),
    path("online/", online_now, name="online-now"),
    path("watching/", watching, name="watching"),
    path("watching/<str:username>/", unwatch, name="unwatch"),
    path("players/<str:username>/", player_profile, name="player-profile"),
]
