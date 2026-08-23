"""WebSocket URL routing for cash tables."""

from django.urls import re_path

from .consumers import CashTableConsumer

websocket_urlpatterns = [
    re_path(r"ws/cash/(?P<table_id>\d+)/$", CashTableConsumer.as_asgi()),
]
