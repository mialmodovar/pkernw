from django.urls import path

from .views import tournament_hands

urlpatterns = [
    path("<int:pk>/hands/", tournament_hands, name="tournament-hands"),
]
