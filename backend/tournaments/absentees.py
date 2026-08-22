"""Seats held by people who are not there.

A registration is a promise to turn up. Somebody who signs up and closes the app
is holding a chair — and in the instant formats they are holding a whole game,
because a Spin n Go fires when its third seat fills and a queue with a ghost in
it never fills at all. The others wait for a player who left.

So a seat is given up on their behalf, eventually. Two rules, because the two
kinds of game are not the same promise:

  A queue — Spin n Go, Sit n Go — goes in minutes. It has no start time to wait
  for and no host to chase anybody; sitting there is itself the statement that
  you are ready now. Five minutes away is enough.

  A tournament is often registered for hours in advance, on purpose, and taking
  somebody's seat away because they closed the tab after signing up for tonight
  would be worse than the problem. So it takes half an hour away AND the
  tournament has to be one that could actually start: unscheduled, or scheduled
  for soon.

Nothing here touches a game that has started. Once cards are dealt the seat has
chips in it that belong to the prize pool, and leaving is the engine's business
(see _sit_out_long_gone_players in game/coordinator.py, which sits a
disconnected player out rather than removing them).
"""

from django.db import transaction

from accounts.presence import forget, offline_seconds

from .coinbank import refund_entry
from .fastgames import FAST_TOURNAMENT_FORMATS
from .models import Tournament, TournamentPlayer

# How long away is long enough, for each kind of game.
QUEUE_AFTER_SECONDS = 5 * 60
TOURNAMENT_AFTER_SECONDS = 30 * 60

# How close to starting a tournament has to be before an absent registration is
# worth clearing. Registering days ahead and closing the app is normal; the seat
# only becomes a problem as the game approaches.
NEAR_START_SECONDS = 15 * 60


def should_unregister(*, is_fast, offline_for, starts_in=None):
    """Whether this seat should be given up on its holder's behalf.

    `offline_for` is seconds since they closed the app, or None if they are here
    or were never seen to leave. `starts_in` is seconds until the scheduled
    start, negative if it has passed, or None for a tournament that starts when
    its host says so.

    Pure, and the reason the rules are worth reading twice: this takes a paid-up
    entry away from somebody who is not there to argue about it.
    """
    if offline_for is None:
        return False
    if is_fast:
        return offline_for >= QUEUE_AFTER_SECONDS
    if offline_for < TOURNAMENT_AFTER_SECONDS:
        return False
    # A tournament with a start time in the distant future is one people
    # register for early on purpose.
    return starts_in is None or starts_in <= NEAR_START_SECONDS


def seconds_until(when, now):
    """Seconds from `now` to `when`, or None when there is no time set."""
    return None if when is None else (when - now).total_seconds()


def drop_absent_registrations(now, here=None):
    """Give up the seats of people who have been gone too long.

    Swept from the lobby rather than from a scheduler: the lobby is polled by
    everybody who has the app open, so this runs often while anybody is around
    to be affected by it, and not at all when nobody is. There is no queue and
    no clock to keep running.

    `here` is whoever asked — they are plainly present, whatever the presence
    socket believes, and a player whose socket failed to open must not have
    their seat taken while they are sitting in the lobby watching it.

    Returns the number of seats given up, which is what the tests read.
    """
    seats = (
        TournamentPlayer.objects
        .filter(tournament__status="lobby")
        .select_related("tournament", "user")
    )

    dropped = 0
    for seat in seats:
        if here is not None and seat.user_id == here:
            continue
        tournament = seat.tournament
        is_fast = tournament.format in FAST_TOURNAMENT_FORMATS
        # The host is the one person a tournament cannot do without: taking
        # their seat would strand everybody else in a lobby nobody can start.
        # A queue has a host only because the column demands one, so the rule
        # does not apply there.
        if not is_fast and tournament.host_id == seat.user_id:
            continue
        if not should_unregister(
            is_fast=is_fast,
            offline_for=offline_seconds(seat.user_id),
            starts_in=seconds_until(tournament.scheduled_start_at, now),
        ):
            continue

        with transaction.atomic():
            TournamentPlayer.objects.filter(pk=seat.pk).delete()
            # Whatever they paid comes back. They did not play.
            refund_entry(seat.user, tournament)
            _tidy_up(tournament, seat.user_id)
        forget(seat.user_id)
        dropped += 1

    return dropped


def _tidy_up(tournament, user_id):
    """What is left of a game once a seat has been taken out of it."""
    remaining = list(tournament.players.select_related("user"))
    if tournament.format in FAST_TOURNAMENT_FORMATS and not remaining:
        # Nothing was played and nobody is left. An empty queue row would be
        # offered to the next player as a game with somebody in it.
        tournament.delete()
        return
    if remaining and tournament.host_id == user_id:
        tournament.host = remaining[0].user
        tournament.save(update_fields=["host"])
