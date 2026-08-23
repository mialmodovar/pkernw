"""Nights that come round again.

"Friday at nine, every week" is how a club actually runs, and until now it was
somebody remembering to make the same tournament by hand every Thursday — with
the same buy-in, the same structure and the same league attached, or not quite,
which is worse. A fixture is that intention written down once: a weekday, a
time, and the settings of the night it produces.

What it produces are ordinary tournaments. Not a special kind that the lobby,
the engine and the ledger would each need to learn about — a fixture opens next
week's game a few days early and then has nothing more to do with it. So a
series can be stopped, or its template edited, without touching a game anybody
has already registered for.

The arithmetic here is all calendar and no database: which occurrence is next,
which are close enough to open, and what to call the arrangement out loud. It is
pure because "next Friday" is the sort of thing that is obviously right until
the week it is a Friday.
"""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils import timezone

# How far ahead a night opens for registration by default. Long enough for
# people to see it coming and put their name down, short enough that the lobby
# is not a list of games in a fortnight.
DEFAULT_DAYS_AHEAD = 4

# The cap on that, because a fixture that opened a year of Fridays at once would
# be a hundred rows nobody asked for.
MAX_DAYS_AHEAD = 21

WEEKDAYS = (
    "Mondays", "Tuesdays", "Wednesdays", "Thursdays",
    "Fridays", "Saturdays", "Sundays",
)


def clean_weekday(value):
    """The weekday if it is one, otherwise None. Monday is 0, as Python has it."""
    try:
        day = int(value)
    except (TypeError, ValueError):
        return None
    return day if 0 <= day <= 6 else None


def clean_days_ahead(value):
    """How early to open a night, held between a day and three weeks."""
    try:
        days = int(value)
    except (TypeError, ValueError):
        return DEFAULT_DAYS_AHEAD
    return max(1, min(MAX_DAYS_AHEAD, days))


def zone_of(name):
    """The clock a fixture's hour is on, or the server's if it has none.

    Takes a name or a timezone, so callers can pass either without asking
    which they are holding. An unknown name falls back rather than raising: a
    timezone renamed out of the database is not a reason to stop a club's
    Friday.
    """
    if not name:
        return timezone.get_current_timezone()
    if hasattr(name, "utcoffset"):
        return name
    try:
        return ZoneInfo(str(name))
    except (ZoneInfoNotFoundError, ValueError):
        return timezone.get_current_timezone()


def local_at(day, at_time, zone=None):
    """A date and an hour on somebody's wall, as a real moment.

    Through a timezone rather than by arithmetic on a UTC stamp: "nine o'clock"
    means nine o'clock in the room, on both sides of a clock change, and a
    series that drifted an hour every spring would be a series people stopped
    trusting.

    Which room is the fixture's to say. It used to be the server's, and the
    server keeps its clocks on UTC on purpose — so a club that meets at nine
    was opening its night at ten for half the year.
    """
    naive = datetime.combine(day, at_time)
    return timezone.make_aware(naive, zone_of(zone))


def next_occurrence(weekday, at_time, now=None, zone=None):
    """The next time this fixture comes round, counting from `now`.

    Today counts if the hour has not passed yet: a Friday fixture asked about at
    noon on Friday is asking about tonight, not about next week. "Friday" is
    read on the fixture's own clock too — a night that starts at one in the
    morning is on a different day in two different rooms.
    """
    here = zone_of(zone)
    local = (now or timezone.now()).astimezone(here)
    ahead = (weekday - local.weekday()) % 7
    candidate = local_at(local.date() + timedelta(days=ahead), at_time, here)
    if candidate > local:
        return candidate
    # A week later on the wall, not 168 hours later: the clocks may change in
    # between, and the club still meets at nine.
    return local_at(local.date() + timedelta(days=ahead + 7), at_time, here)


def occurrences_within(weekday, at_time, days_ahead, now=None, zone=None):
    """Every occurrence between now and `days_ahead` from now, soonest first.

    Usually one. Two when a fortnight is opened at once, and the list rather
    than the single next one is what makes the opener idempotent: it asks for
    everything that should exist by now and creates whatever does not.
    """
    here = zone_of(zone)
    local = (now or timezone.now()).astimezone(here)
    horizon = local + timedelta(days=days_ahead)

    found = []
    when = next_occurrence(weekday, at_time, now, here)
    while when <= horizon:
        found.append(when)
        # Again on the wall rather than by the hour, so a series does not step
        # sideways the weekend the clocks do.
        when = local_at(when.astimezone(here).date() + timedelta(days=7), at_time, here)
    return found


def describe(weekday, at_time):
    """"Fridays at 21:00" — the whole arrangement, in one line."""
    day = WEEKDAYS[weekday] if 0 <= weekday <= 6 else "Every week"
    return f"{day} at {at_time.strftime('%H:%M')}"


def from_moment(when, zone=None):
    """The weekday and time a one-off start implies.

    A host who scheduled Friday at nine and then asked for it to repeat has
    already said when: reading it back off that moment is better than asking
    them the same question twice in different words.

    On the host's clock, which is the whole point. Read on the server's, a
    night somebody scheduled for nine came back as a series at eight — and the
    lobby went on saying nine, because the lobby reads the moment rather than
    the arrangement. Two answers to the same question, both on screen.
    """
    local = when.astimezone(zone_of(zone))
    return local.weekday(), time(local.hour, local.minute)
