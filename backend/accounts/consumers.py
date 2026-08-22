"""The presence socket: open for as long as the app is.

Two jobs, and the second one came later.

It exists so that holding the app open is a fact the server can observe — a
websocket rather than a polled heartbeat because browsers throttle timers in a
backgrounded tab to about one a minute and freeze them outright in a discarded
one, and "the app is open" should not depend on how aggressively Chrome is
saving battery.

And because it is the one connection a player has from *anywhere* in the app,
it is also how they are told something that is not about the page they are
reading — that a game they queued for has started while they were at a
different table. That is a group per player, joined by their own sockets alone
(see notify.py). It is deliberately not a fan-out: this shares an event loop
with the tournament engine, and a presence change broadcast to every connected
client would put that work in front of the next hand. One player's own news,
sent to one player, does not.

Nothing sent up it is read. It talks in one direction only.
"""

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone

from .notify import user_group
from .presence import arrived, left


@database_sync_to_async
def _stamp_last_seen(user_id):
    """Write down when this player last had the app open.

    On the way out rather than on a timer: the only thing that reads it is the
    sweep for seats held by people who left (tournaments/absentees.py), and it
    only has a question to ask about somebody who is not here.

    Best effort. A player whose closing socket could not be written down still
    closed it, and their seat is then safe until the next time they leave —
    which errs in the right direction.
    """
    from .models import Profile

    Profile.objects.filter(user_id=user_id).update(last_seen=timezone.now())


class PresenceConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user", AnonymousUser())
        if isinstance(user, AnonymousUser) or user.is_anonymous:
            await self.close()
            return
        self.user_id = user.id
        self.group = user_group(user.id)
        arrived(self.user_id)
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

    async def receive(self, text_data=None, bytes_data=None):
        return

    async def user_message(self, event):
        """One message for this player, from notify_user."""
        await self.send(text_data=event["data"])

    async def disconnect(self, code):
        # Absent when the connection was refused above, which never counted.
        user_id = getattr(self, "user_id", None)
        if user_id is not None:
            left(user_id)
            await _stamp_last_seen(user_id)
        group = getattr(self, "group", None)
        if group is not None:
            await self.channel_layer.group_discard(group, self.channel_name)
