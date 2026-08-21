"""Who has the app open, as opposed to who is sitting at a table.

Being at a table is answered by `_player_channels` in game.consumers, and for a
long time that was the only answer available — so a player reading the lobby
with the app in front of them showed as offline to everybody watching them.
This is the other half: a socket held open by the app itself, from wherever in
it you happen to be.

Module state, like the registries in game.consumers, and for the same reason:
entrypoint.sh deliberately runs one process, so a REST view in it can read this
directly.
"""

from typing import Dict


# Counted rather than a set. Two tabs, or React's double mount in development,
# each open a socket, and the first one to close must not take the player
# offline while the other is still there.
_socket_counts: Dict[int, int] = {}


def arrived(user_id: int) -> None:
    _socket_counts[user_id] = _socket_counts.get(user_id, 0) + 1


def left(user_id: int) -> None:
    remaining = _socket_counts.get(user_id, 0) - 1
    if remaining > 0:
        _socket_counts[user_id] = remaining
    else:
        _socket_counts.pop(user_id, None)


def online_user_ids() -> set:
    """Everybody with the app open right now."""
    return set(_socket_counts)
