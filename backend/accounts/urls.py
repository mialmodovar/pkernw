from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import RegisterView, MeView

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/",    TokenObtainPairView.as_view(), name="token_obtain"),
    path("refresh/",  TokenRefreshView.as_view(), name="token_refresh"),
    path("me/",       MeView.as_view(), name="me"),
]
