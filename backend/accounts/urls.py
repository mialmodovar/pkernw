from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import RegisterView, MeView, update_avatar
from .stats import my_stats

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/",    TokenObtainPairView.as_view(), name="token_obtain"),
    path("refresh/",  TokenRefreshView.as_view(), name="token_refresh"),
    path("me/",       MeView.as_view(), name="me"),
    path("me/avatar/", update_avatar, name="update_avatar"),
    path("me/stats/", my_stats, name="my_stats"),
]
