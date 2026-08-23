"""Things worth doing, and what they pay.

The daily coins are a faucet: you press a button and money appears. These are
the other kind — coins for having played, which is the only kind that makes the
games themselves worth opening. Both formats count, because a mission that can
only be finished in one of them is a mission telling people which one to play.

Nothing here counts anything as it happens. There is no running total on a
profile, no counter incremented at the end of a hand, no signal to miss and
nothing to drift: progress is read back out of the games already recorded, and
the only thing stored is the claim. That means a mission can be added, retuned
or dropped and every player's progress towards it is simply true the moment the
list changes — and it means a mission cannot be paid twice, because paying it
is a row that either exists or does not.

The periods are calendar ones in the server's own timezone. A day that ended at
03:47 because that is when somebody first logged in is a punishment rather than
a reset, and the same goes for a week.
"""

from datetime import timedelta

from django.utils import timezone

# What each period is called when a claim is filed under it. Dates, so the row
# says what it means to anybody reading the table.
DAILY = "daily"
WEEKLY = "weekly"

# The catalogue. `counts` names which tally in counts_for() this reads, and
# `target` how much of it finishes the job.
#
# The rewards are set against a buy-in rather than against each other: the
# cheapest Spin n Go is 25 coins, so a day's missions are worth about ten of
# them and a week's about sixty. Enough that somebody who plays every day is
# never stuck; not so much that the games stop mattering.
#
# The cash ones count hands rather than results. A mission that asked somebody
# to finish a cash session up would be a mission asking them to quit while
# winning, which is both bad advice and unreadable — a cash game has no end to
# be measured at. Hands dealt is the one thing about a cash table that is
# finished, over and over.
MISSIONS = (
    {
        "key": "daily_play",
        "period": DAILY,
        "label": "Play three",
        "blurb": "Any three Spin n Gos or Sit n Gos, finished today.",
        "detail": "Sit at any three instant games and play them to the end. Where you "
                  "finish does not matter. A game counts on the day it finishes, so one "
                  "that runs past midnight counts for tomorrow.",
        "counts": "games",
        "target": 3,
        "coins": 60,
    },
    {
        "key": "daily_win",
        "period": DAILY,
        "label": "Take one down",
        "blurb": "Finish first in any game today.",
        "detail": "Win one Spin n Go or Sit n Go outright today. Second place in a "
                  "six-max pays coins but does not count here — this one asks for "
                  "first.",
        "counts": "wins",
        "target": 1,
        "coins": 120,
    },
    {
        "key": "daily_both",
        "period": DAILY,
        "label": "Try both rooms",
        "blurb": "One Spin n Go and one Sit n Go, today.",
        "detail": "Play at least one of each: one Spin n Go and one Sit n Go, in the "
                  "same day. Two Spin n Gos is half of it. Heads Up and 6-Max are both "
                  "Sit n Gos.",
        "counts": "formats",
        "target": 2,
        "coins": 80,
    },
    {
        "key": "weekly_play",
        "period": WEEKLY,
        "label": "Twenty this week",
        "blurb": "Any format. About three a day.",
        "detail": "Twenty instant games finished between Monday and Sunday, in any "
                  "mixture of formats. The three you play for today's mission count "
                  "towards this one too.",
        "counts": "games",
        "target": 20,
        "coins": 400,
    },
    {
        "key": "weekly_win",
        "period": WEEKLY,
        "label": "Five wins",
        "blurb": "Five firsts across the week.",
        "detail": "Win five games between Monday and Sunday. Any format, and they do "
                  "not have to be on different days.",
        "counts": "wins",
        "target": 5,
        "coins": 700,
    },
    {
        "key": "daily_cash",
        "period": DAILY,
        "label": "Sit in a cash game",
        "blurb": "Play twenty hands at any cash table today.",
        "detail": "Twenty hands dealt to you at any cash table, at any stake, "
                  "today. Hands you fold count — being dealt in is the whole of "
                  "it. Sitting out does not, because you are not dealt in.",
        "counts": "cash_hands",
        "target": 20,
        "coins": 80,
    },
    {
        "key": "weekly_cash",
        "period": WEEKLY,
        "label": "A hundred at the cash tables",
        "blurb": "A hundred cash hands across the week.",
        "detail": "A hundred hands dealt to you at cash tables between Monday "
                  "and Sunday, in any mixture of stakes. The twenty you play "
                  "for today's mission count towards this one too. Whether you "
                  "are up or down at the end of it does not come into it.",
        "counts": "cash_hands",
        "target": 100,
        "coins": 500,
    },
    {
        "key": "weekly_spin",
        "period": WEEKLY,
        "label": "Catch a big spin",
        "blurb": "Be in a Spin n Go that draws 5x or more.",
        "detail": "Sit in a Spin n Go whose wheel lands on 5x or better — about one "
                  "game in eight. You do not have to win it: being at the table when "
                  "it is drawn is the whole of it.",
        "counts": "big_spin",
        "target": 1,
        "coins": 500,
    },
)

BY_KEY = {mission["key"]: mission for mission in MISSIONS}

# What counts as a big draw for the weekly. Matches the ladder in
# tournaments/spingo.py, where 5x is the first multiplier worth telling anybody
# about.
BIG_MULTIPLIER = 5


def clean_key(value):
    """The mission if it is one of ours, otherwise None."""
    return BY_KEY.get(str(value or "").strip())


def period_key(period, when=None):
    """What this claim is filed under.

    A date for a day, and the Monday's date for a week — readable, sortable,
    and unambiguous about which period is meant without needing to know the
    rules that made it.
    """
    local = timezone.localtime(when or timezone.now())
    if period == WEEKLY:
        return (local.date() - timedelta(days=local.weekday())).isoformat()
    return local.date().isoformat()


def window(period, when=None):
    """The span a period covers, as (start, end) in real time.

    Ends at the start of the next one rather than at 23:59:59, so a game that
    finished in the last second of a Sunday belongs to that week and to no
    other.
    """
    local = timezone.localtime(when or timezone.now())
    midnight = local.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == WEEKLY:
        start = midnight - timedelta(days=local.weekday())
        return start, start + timedelta(days=7)
    return midnight, midnight + timedelta(days=1)


def progress_of(mission, counts):
    """How far along this mission is, capped at its target.

    Capped because the number is shown as "3 / 3" and a player who won six
    games has not won six of the one game the mission asked for.
    """
    got = max(0, int(counts.get(mission["counts"], 0)))
    return min(got, mission["target"])


def state_of(mission, counts, claimed_periods, when=None):
    """One mission, as the panel draws it.

    `claimed_periods` is the set of (key, period) pairs already paid, which is
    what makes this idempotent without asking the wallet anything.
    """
    period = period_key(mission["period"], when)
    done = progress_of(mission, counts) >= mission["target"]
    claimed = (mission["key"], period) in claimed_periods
    return {
        "key": mission["key"],
        "period": mission["period"],
        "period_key": period,
        "label": mission["label"],
        "blurb": mission["blurb"],
        # The long form, for the tooltip. What counts, what does not, and when
        # the clock runs out — the three things people were guessing at.
        "detail": mission["detail"],
        "target": mission["target"],
        "progress": progress_of(mission, counts),
        "coins": mission["coins"],
        "done": done,
        "claimed": claimed,
        # The only state the button cares about, worked out here so the client
        # cannot decide it differently.
        "claimable": done and not claimed,
    }


def board(daily_counts, weekly_counts, claimed_periods, when=None):
    """Every mission, in order, with the counts each period needs."""
    return [
        state_of(
            mission,
            daily_counts if mission["period"] == DAILY else weekly_counts,
            claimed_periods,
            when,
        )
        for mission in MISSIONS
    ]
