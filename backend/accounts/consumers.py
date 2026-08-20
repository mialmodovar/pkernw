"""The presence socket: open for as long as the app is.

Deliberately silent. Nothing is sent down it and nothing sent up it is read —
it exists so that holding the app open is a fact the server can observe. A
websocket rather than a polled heartbeat because browsers throttle timers in a
backgrounded tab to about one a minute and freeze them outright in a discarded
one, and "the app is open" should not depend on how aggressively Chrome is
saving battery.

No channel layer group, for the same reason there is no timer: this shares an
event loop with the tournament engine, and a presence change that fanned out to
every connected client would put that work in front of the next hand.
"""

from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth.models import AnonymousUser

from .presence import arrived, left


class PresenceConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user", AnonymousUser())
        if isinstance(user, AnonymousUser) or user.is_anonymous:
            await self.close()
            return
        self.user_id = user.id
        arrived(self.user_id)
        await self.accept()

    async def receive(self, text_data=None, bytes_data=None):
        return

    async def disconnect(self, code):
        # Absent when the connection was refused above, which never counted.
        user_id = getattr(self, "user_id", None)
        if user_id is not None:
            left(user_id)
