"""WebSocket URL routing."""

from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r"ws/tournament/(?P<tournament_id>\d+)/$", consumers.TournamentConsumer.as_asgi()),
]
