"""Telling one player something while they are somewhere else in the app.

The presence socket is the only connection a player has that is not about a
particular tournament — it is open from the lobby, from a club page, and from
the felt of a different game. So it is the one place a message can reach
somebody who is not looking at the thing the message is about.

A group per player, joined only by that player's own sockets. This is not the
fan-out the presence consumer refuses to do: nothing here is ever sent to
everybody, and each message is one player's own news, delivered a handful of
times an evening. The cost on the event loop the tournaments share is a
group_send to one or two channels at a moment nobody is being dealt to.

Never raises. A player who cannot be told their game has started still has a
game that has started, and the seat they paid for must not fail behind a
notification that did.
"""

import json

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def user_group(user_id: int) -> str:
    return f"user_{user_id}"


def notify_user(user_id: int, payload: dict) -> bool:
    """Send one message down every presence socket this player has open.

    Callable from a plain view, which is where the things worth telling somebody
    about happen — `async_to_sync` because those run in a worker thread with no
    event loop of their own. It must not be called from async code, which has
    the channel layer to hand and should await `group_send` itself.

    Returns whether the message was handed to the channel layer, which is not a
    promise that anybody was listening: a player with the app shut has no socket
    and no group, and that is a delivery to nowhere rather than a failure.
    """
    layer = get_channel_layer()
    if layer is None:
        return False
    try:
        async_to_sync(layer.group_send)(
            user_group(user_id),
            {"type": "user.message", "data": json.dumps(payload)},
        )
        return True
    except Exception:
        # A dead Redis, or a payload that will not serialise. Both are worth
        # fixing and neither is worth failing the request that got here — the
        # caller has already taken somebody's coins and started their game.
        return False
