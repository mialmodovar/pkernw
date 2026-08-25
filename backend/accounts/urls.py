from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .google_views import google_config, google_link, google_sign_in
from .views import (
    RegisterView, MeView, avatar_image, avatar_image_for_user, update_avatar,
    update_display_name, update_preferences, update_theme,
    recover_password, reset_recovery_code,
)
from .friends import friends, unfriend
from .stats import my_stats, player_profile
from .watching import online_now, search_players

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
    # Signing in with Google, and connecting one to an account that already
    # exists. See accounts/googleauth.py.
    path("google/", google_sign_in, name="google-sign-in"),
    path("google/config/", google_config, name="google-config"),
    path("google/link/", google_link, name="google-link"),
    path("players/search/", search_players, name="search_players"),
    path("me/stats/", my_stats, name="my_stats"),
    path("online/", online_now, name="online-now"),
    # Friends, which is what watching became: agreed rather than private, and
    # the same list on both sides. See accounts/friends.py.
    path("friends/", friends, name="friends"),
    path("friends/<str:username>/", unfriend, name="unfriend"),
    path("players/<str:username>/", player_profile, name="player-profile"),
]
