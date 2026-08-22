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

import time
from typing import Dict, Optional


# Counted rather than a set. Two tabs, or React's double mount in development,
# each open a socket, and the first one to close must not take the player
# offline while the other is still there.
_socket_counts: Dict[int, int] = {}

# When each player's last socket closed. Kept because "offline" on its own is
# not enough to act on: a seat held by somebody who closed the app is only worth
# giving up after a while, and how long ago they went is the whole question.
# Monotonic, so it survives the clock being set.
_gone_since: Dict[int, float] = {}


def arrived(user_id: int) -> None:
    _socket_counts[user_id] = _socket_counts.get(user_id, 0) + 1
    _gone_since.pop(user_id, None)


def left(user_id: int) -> None:
    remaining = _socket_counts.get(user_id, 0) - 1
    if remaining > 0:
        _socket_counts[user_id] = remaining
    else:
        _socket_counts.pop(user_id, None)
        _gone_since[user_id] = time.monotonic()


def online_user_ids() -> set:
    """Everybody with the app open right now."""
    return set(_socket_counts)


def offline_seconds(user_id: int) -> Optional[float]:
    """How long this player has had the app closed, or None.

    None means "not known to be away": either they are here, or they have not
    been seen at all since this process started. The second case is why a
    restart cannot cost anybody their seat — nothing is assumed about a player
    the process never watched leave.
    """
    if user_id in _socket_counts:
        return None
    since = _gone_since.get(user_id)
    return None if since is None else time.monotonic() - since


def forget(user_id: int) -> None:
    """Drop what is remembered about somebody being away.

    Called once their seat has actually been given up, so the sweep does not
    keep reconsidering a player it has already dealt with.
    """
    _gone_since.pop(user_id, None)
