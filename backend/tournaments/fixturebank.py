"""Opening the nights a fixture promises.

The pure calendar is in fixtures.py; this is the part that writes rows. Two
jobs: turn a tournament somebody already made into a weekly series, and open
whichever occurrences are close enough to register for.

Swept from the lobby, like the scheduled starts and the absent registrations
beside it — there is no scheduler in this app and one occurrence a week is not
a reason to acquire one. The lobby is polled by everybody who has it open, so
this runs while there is anybody to register for a night, and not at all when
there is not.

Nothing here can open the same night twice: (fixture, occurs_on) is unique, and
two lobby requests arriving together race for that row rather than for a check.
"""

from django.db import IntegrityError, transaction

from .fixtures import clean_days_ahead, from_moment, occurrences_within
from .models import BlindLevel, Fixture, Tournament

# The tournament fields a series carries forward. Everything else about a game
# is either its own (status, who is in it, when it started) or is set by the
# occurrence (scheduled_start_at).
CARRIED = (
    "name", "game_type", "starting_chips", "buy_in_cents", "buy_in_coins",
    "max_players", "players_per_table", "late_reg_level",
    "allow_rebuys", "max_rebuys", "rebuy_level",
    "time_bank_seconds", "time_bank_refill_rule", "time_bank_refill_every_hands",
    "time_bank_refill_level", "payout_structure", "rabbit_hunting_enabled",
    "auto_remove_offline_seconds", "bounty_mode", "bounty_cents",
    "bounty_progressive_split_pct", "mystery_release", "showdown_seconds",
)

LEVEL_FIELDS = (
    "level_number", "is_break", "small_blind", "big_blind", "ante",
    "duration_hands", "duration_minutes",
)


def template_of(tournament):
    """The settings of this game, as the next one will be made from them."""
    return {field: getattr(tournament, field) for field in CARRIED}


def levels_of(tournament):
    """Its blind ladder, in order, as plain rows."""
    return [
        {field: getattr(level, field) for field in LEVEL_FIELDS}
        for level in tournament.levels.order_by("level_number")
    ]


def start_series(tournament, days_ahead=None):
    """Make this tournament the first of a weekly series.

    Read off the game rather than asked for again: a host who scheduled Friday
    at nine and then pressed "repeat weekly" has already said when, and asking
    the same question in different words is how the two answers end up
    disagreeing.

    Returns the fixture, or a string saying why not.
    """
    if tournament.fixture_id:
        return "This is already part of a series."
    if tournament.scheduled_start_at is None:
        return "Give it a start time first — a series needs an hour to come round at."

    weekday, at_time = from_moment(tournament.scheduled_start_at)
    with transaction.atomic():
        fixture = Fixture.objects.create(
            name=tournament.name,
            host=tournament.host,
            club=tournament.club,
            season=tournament.season,
            weekday=weekday,
            start_time=at_time,
            days_ahead=clean_days_ahead(days_ahead),
            template=template_of(tournament),
            levels=levels_of(tournament),
        )
        # The game that started it belongs to the series, so the series does not
        # immediately open a second one for the same night.
        tournament.fixture = fixture
        tournament.occurs_on = tournament.scheduled_start_at.date()
        tournament.save(update_fields=["fixture", "occurs_on"])
    return fixture


def stop_series(fixture):
    """Stop it coming round. What it has already opened stays open.

    Deactivated rather than deleted: people are registered for next Friday, and
    a club is entitled to see that Friday used to be a thing.
    """
    fixture.active = False
    fixture.save(update_fields=["active"])
    return fixture


def open_due_fixtures(now=None):
    """Open every night that is close enough to register for.

    Returns how many were opened, which is what the tests read.
    """
    opened = 0
    for fixture in Fixture.objects.filter(active=True).select_related("club", "season", "host"):
        for when in occurrences_within(
            fixture.weekday, fixture.start_time, clean_days_ahead(fixture.days_ahead), now,
        ):
            if _open_one(fixture, when):
                opened += 1
    return opened


def _open_one(fixture, when):
    """One occurrence, if it is not already there. True when it was made."""
    occurs_on = when.date()
    # A cheap look first — this runs on lobby requests and nearly always finds
    # the night already open. The unique constraint below is what actually
    # decides; this only keeps the common case off it.
    if Tournament.objects.filter(fixture=fixture, occurs_on=occurs_on).exists():
        return False

    season = fixture.season if fixture.season and fixture.season.is_open else None
    try:
        with transaction.atomic():
            tournament = Tournament.objects.create(
                host=fixture.host,
                club=fixture.club,
                # A closed season takes no new nights, and the night is not
                # worth cancelling over it: it runs, and counts for nothing.
                season=season,
                scheduled_start_at=when,
                fixture=fixture,
                occurs_on=occurs_on,
                **fixture.template,
            )
            tournament.ensure_table(1)
            BlindLevel.objects.bulk_create([
                BlindLevel(tournament=tournament, **row) for row in fixture.levels
            ])
    except IntegrityError:
        # Another request opened it between the look above and here.
        return False
    return True
