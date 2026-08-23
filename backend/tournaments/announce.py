"""Telling players about their own tournament while they are somewhere else.

A tournament starts on a clock or on a host pressing a button, and neither is a
moment the people in it are necessarily watching. Somebody who registered for
the nine o'clock game and went to play a Spin n Go — or to read the news — was
being dealt into a table nothing had told them about. The queues have said so
for a while (see fastgames_views); this is the same courtesy for the games
people arrange.

Two messages, and no more than two: it is starting soon, and it has started.
Anything else is a notification about a thing they can already see.

Delivery is the presence socket, which is open from wherever in the app they
are (accounts/notify.py). It never raises and it never blocks: a player who
cannot be told their game has started still has a game that has started, and
the request that started it must not fail behind a message that did not send.
"""

from accounts.notify import notify_user

# How long before a scheduled start is worth an interruption. Long enough to
# finish a hand somewhere else and walk over; short enough that it is news.
WARN_BEFORE_SECONDS = 5 * 60

# Which tournaments have already had their warning. Module state, like the
# presence registry it sits beside — one process, by design. A restart forgets,
# and the worst that costs is one repeated warning, which the client folds into
# the notification it already has by tag.
_warned = set()


def payload_for(tournament, kind):
    """What the app is told, in the shape GameStartAlert already reads.

    `label` leads because "your game" names nothing to somebody registered for
    three of them, and the prize follows because it is why they entered.
    """
    return {
        "type": kind,
        "game": {
            "id": tournament.id,
            "label": tournament.name,
            "prize_coins": (tournament.buy_in_coins or 0) * tournament.players.count(),
            "buy_in_cents": tournament.buy_in_cents or 0,
            "starts_in_seconds": WARN_BEFORE_SECONDS if kind == "tournament_starting" else 0,
        },
    }


def _tell_everybody(tournament, kind):
    payload = payload_for(tournament, kind)
    seats = tournament.players.values_list("user_id", flat=True)
    for user_id in seats:
        notify_user(user_id, payload)
    return len(seats)


def announce_start(tournament):
    """Their tournament is dealing. Told to everybody holding a seat in it.

    Including whoever pressed the button: they may have started it from a phone
    in another room, and the client drops an alert about a table it is already
    looking at (see worthTelling).
    """
    _warned.discard(tournament.id)
    return _tell_everybody(tournament, "tournament_started")


def announce_starting_soon(tournament, seconds_away):
    """A five-minute warning, once, for a tournament with a time on it.

    Once is the whole rule. A reminder that arrives every time somebody opens
    the lobby is not a reminder, it is a nag — and this is swept from the lobby,
    which is polled every few seconds.
    """
    if tournament.id in _warned:
        return 0
    if seconds_away is None or not 0 < seconds_away <= WARN_BEFORE_SECONDS:
        return 0
    _warned.add(tournament.id)
    return _tell_everybody(tournament, "tournament_starting")


def forget(tournament_id=None):
    """Test seam, and what a finished tournament leaves behind."""
    if tournament_id is None:
        _warned.clear()
    else:
        _warned.discard(tournament_id)
