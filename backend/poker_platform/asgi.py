"""ASGI config — Channels routing for HTTP + WebSocket."""

import os
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "poker_platform.settings")

# Initialize Django before importing anything that touches models
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from game.routing import websocket_urlpatterns               # noqa: E402
from game.middleware import JWTAuthMiddleware                 # noqa: E402

application = ProtocolTypeRouter({
    "http":      django_asgi_app,
    "websocket": JWTAuthMiddleware(URLRouter(websocket_urlpatterns)),
})
