"""The socket a cash table is played on.

Deliberately thin. Everything hard about a live table — asking a player to act,
the clock on it, the pending action that survives a reload, the group every seat
listens to — already exists for tournaments and is keyed on a room id rather
than on anything about a tournament. So this registers the same way, in the same
registries, under the room id `cash-<table>`, and the rest works unchanged.

What is here is only what a cash table does differently: you arrive at a seat
you already own rather than one a draw gave you, and you can leave with your
chips at any moment.
"""

import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth.models import AnonymousUser

from game.consumers import (
    _action_queues,
    _broadcast_table,
    _player_channels,
    _table_group_name,
)

from .live import ensure_room, room_id, running_room, seat_rows
from .models import CashSeat, CashTable


class CashTableConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user", AnonymousUser())
        if isinstance(user, AnonymousUser) or user.is_anonymous:
            await self.close()
            return

        self.user = user
        self.table_id = int(self.scope["url_route"]["kwargs"]["table_id"])
        self.room = room_id(self.table_id)
        self.group = _table_group_name(self.room, 1)

        table = await self._table()
        if table is None:
            await self.close()
            return

        # A seat is not required to watch — a cash table is a room, and standing
        # at the rail is a thing people do. Only a seated player is registered
        # for actions.
        self.seat = await self._seat()
        if self.seat is not None:
            key = (self.room, self.user.id)
            _player_channels[key] = self.channel_name
            _action_queues.setdefault(key, __import__("asyncio").Queue())

        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

        room = await ensure_room(self.table_id)
        if room is not None:
            await self.send(text_data=json.dumps(room.snapshot(await self._seat_rows())))

    async def receive(self, text_data=None, bytes_data=None):
        try:
            data = json.loads(text_data or "")
        except ValueError:
            return

        kind = data.get("type")
        if kind == "rabbit_hunt":
            # Buying a look at what would have come. The room holds the cards
            # and the price; the name comes off the seat it was dealt to.
            room = running_room(self.table_id)
            if room is not None:
                await room.buy_rabbit_hunt(self.user.id)
            return
        if kind != "player_action":
            return
        queue = _action_queues.get((self.room, self.user.id))
        if queue is not None:
            await queue.put((data.get("action", "fold"), data.get("amount", 0)))

    async def game_message(self, event):
        """One event off the table, handed to this socket.

        Every broadcast in the app is group_send'd as `game.message`, and
        Channels dispatches that by looking for a method of this name. Without
        one it raises instead, which kills the socket — so a table with nobody
        to deal to, quietly announcing itself every two seconds, was closing
        every socket at it on a loop and the client was reading that as a
        connection that would not stay up.
        """
        await self.send(text_data=event["data"])

    async def disconnect(self, code):
        group = getattr(self, "group", None)
        if group is not None:
            await self.channel_layer.group_discard(group, self.channel_name)

        key = (getattr(self, "room", None), getattr(getattr(self, "user", None), "id", None))
        if key[0] is None or key[1] is None:
            return
        # Only if this socket is still the live one: a reload registers the new
        # one before the old one tears down.
        if _player_channels.get(key) == self.channel_name:
            _player_channels.pop(key, None)
            room = running_room(self.table_id)
            player = room.player_at(self.user.id) if room else None
            if player is not None:
                # The seat stays and the stack stays: leaving the page is not
                # leaving the table, and the coins in front of somebody are
                # theirs whether or not they are looking at them. The clock
                # acts for them, exactly as it does for anybody who does not.
                await _broadcast_table(self.room, 1, "player_disconnected", {
                    "seat": player._seat, "name": player.name,
                })

    @database_sync_to_async
    def _table(self):
        return CashTable.objects.filter(id=self.table_id, is_open=True).first()

    @database_sync_to_async
    def _seat(self):
        return CashSeat.objects.filter(table_id=self.table_id, user=self.user).first()

    @database_sync_to_async
    def _seat_rows(self):
        # The loop's own reading of the seats, faces and all: a snapshot that
        # described the table differently from the hands that follow it would
        # be a second definition of who is sitting where.
        return seat_rows(self.table_id)
