"""The games you sit down at rather than schedule.

A tournament is somebody's night: a host opens it, sets the stakes and the
structure, and people register for it. These are the opposite — a fixed shape,
a fixed price, no host, and they fire the moment the seats fill. Three of them
so far, and the differences between them are entirely in this table:

* **Spin n Go** — three seats, and a prize drawn when the third player sits.
* **Heads Up** — two seats, front to front, over in the time it takes to make
  a coffee.
* **6-Max** — six seats, the shortest thing here that still feels like a
  tournament.
* **All In or Fold** — four seats, fifteen blinds, push or fold, and the buy-ins
  are not a prize pool at all: they are the bounties on the four heads.

Everything else about them is the same machinery, which is why they share a
lobby, an endpoint and a settlement. Adding a fourth is a row in FORMATS.

No Django here beyond the shapes it will be asked to build: this module is the
rules, and tournaments/fastgames_views.py is what makes them out of database
rows.
"""

from dataclasses import dataclass
from typing import Tuple

from . import spingo


@dataclass(frozen=True)
class FastFormat:
    """One kind of instant game, and everything that makes it that kind."""

    key: str
    label: str
    # One glyph for the format, so a tab tells you what kind of game it is
    # before you have read anything. Served rather than picked in the client:
    # the format's name and its face belong together.
    icon: str
    blurb: str
    # Which Tournament.format the rows carry. Two of these are Sit n Gos and
    # differ only in how many seats they have.
    tournament_format: str
    seats: int
    stakes: Tuple[int, ...]
    starting_chips: int
    # (small blind, big blind, ante) per level, in order.
    blinds: Tuple[Tuple[int, int, int], ...]
    level_minutes: int
    # (place, label, percentage). Must total 100 — asserted by a test rather
    # than at import, because a broken table should fail the build, not the app.
    payouts: Tuple[Tuple[int, str, int], ...]
    # What to tell somebody deciding whether they have time for one.
    duration: str
    time_bank_seconds: int
    showdown_seconds: int
    # Spin n Go only: the prize is a draw rather than the buy-ins.
    draws_multiplier: bool = False
    # All In or Fold only: a raise may only ever be the whole stack, and the
    # buy-ins are the bounties rather than the places.
    all_in_or_fold: bool = False
    mystery_bounty: bool = False

    @property
    def big_blinds(self) -> int:
        """The starting stack, in big blinds — the only honest way to say how
        deep a format is, since the chip numbers are arbitrary."""
        return self.starting_chips // self.blinds[0][1]


# Two minutes a level everywhere. It is what makes these turbos, and one number
# across all three means a player who has played one knows the pace of the rest.
LEVEL_MINUTES = 2

# Every buy-in any instant format offers, cheapest first.
#
# One ladder rather than a set per format, for the reason the cash stakes are
# one ladder: a player who knows what a 50 costs knows it everywhere, and a
# lobby of one-off prices is a lobby where nobody meets anybody. The rungs
# roughly double, so the step from one to the next is always the same decision
# rather than a bigger one at the top than at the bottom.
#
# The bottom is set by the daily handout: five coins is a game somebody with
# nothing but today's claim can play twenty of, which is what keeps a bad run
# from ending an evening. The top is set by the Spin n Go, because five hundred
# is where the hundred-times draw is fifty thousand coins — enough to be worth
# sitting for and not so much that one hand rewrites the economy.
STAKE_LADDER = (5, 10, 25, 50, 100, 250, 500)

# Where a format joins the ladder. Nothing starts below the rung where its own
# prize is still worth collecting: a six-handed 5 pays its winner nineteen
# coins, which is not a game anybody would remember playing, and a four-handed
# All In or Fold divides that same 5 into four bounties of five. The two-and
# three-seat formats have no such floor, so they get the whole thing.
LADDER_FROM_10 = STAKE_LADDER[1:]

FORMATS = {
    "spingo": FastFormat(
        key="spingo",
        label="Spin n Go",
        icon="\U0001F3A1",
        blurb="Three players. The prize is drawn when the third one sits — usually twice the "
              "buy-in, occasionally a hundred times it. Winner takes all of it.",
        tournament_format="spingo",
        seats=spingo.SEATS,
        stakes=spingo.STAKES,
        starting_chips=spingo.STARTING_CHIPS,
        blinds=spingo.BLINDS,
        level_minutes=spingo.LEVEL_MINUTES,
        payouts=((1, "1st", 100),),
        duration="3-5 min",
        time_bank_seconds=10,
        showdown_seconds=3,
        draws_multiplier=True,
    ),
    "hu": FastFormat(
        key="hu",
        label="Heads Up",
        icon="\u2694\ufe0f",
        blurb="One on one, front to front. Twenty-five big blinds each and blinds that climb "
              "every two minutes — there is nowhere to hide and no reason to wait.",
        tournament_format="sitngo",
        seats=2,
        # The whole ladder. Two seats and one prize is the simplest thing here,
        # so it is the one that should be available at every price.
        stakes=STAKE_LADDER,
        # Twenty-five blinds: enough to play a hand out, short enough that the
        # whole thing is decided inside ten minutes.
        starting_chips=1000,
        blinds=(
            (20, 40, 0),
            (30, 60, 0),
            (50, 100, 10),
            (75, 150, 15),
            (100, 200, 25),
            (150, 300, 40),
            (250, 500, 60),
            (400, 800, 100),
            # Past what two thousand chips can survive — the last level never
            # raises, so it has to be one nobody can sit in.
            (600, 1200, 150),
        ),
        level_minutes=LEVEL_MINUTES,
        payouts=((1, "1st", 100),),
        duration="5-10 min",
        time_bank_seconds=15,
        showdown_seconds=3,
    ),
    "sixmax": FastFormat(
        key="sixmax",
        label="6-Max",
        icon="\U0001F465",
        blurb="Six seats, thirty big blinds, and the top two paid. The shortest thing here "
              "that still plays like a tournament.",
        tournament_format="sitngo",
        seats=6,
        # From 10 up: see LADDER_FROM_10. A 5 split between six players pays
        # the winner nineteen coins for ten minutes' work.
        stakes=LADDER_FROM_10,
        starting_chips=1500,
        blinds=(
            (25, 50, 0),
            (40, 80, 0),
            (60, 120, 10),
            (100, 200, 25),
            (150, 300, 30),
            (250, 500, 50),
            (400, 800, 80),
            (600, 1200, 120),
            (1000, 2000, 200),
            # As above: the ladder has to outlast the chips.
            (1500, 3000, 300),
            (2500, 5000, 500),
        ),
        level_minutes=LEVEL_MINUTES,
        # Two of six, which is what a six-handed sit and go has always paid.
        # Paying one makes it a lottery; paying three makes second place a
        # rounding error.
        payouts=((1, "1st", 65), (2, "2nd", 35)),
        duration="10-15 min",
        time_bank_seconds=20,
        showdown_seconds=4,
    ),
    "allinfold": FastFormat(
        key="allinfold",
        label="All In or Fold",
        icon="\u26A1",
        blurb="Four players, fifteen blinds, and two decisions: shove or fold. Every buy-in "
              "goes on a head — knock somebody out and you open an envelope. The winner "
              "keeps the one that was on their own.",
        tournament_format="allinfold",
        seats=4,
        # Fifteen big blinds at the opening 50/100, like a Spin n Go: shallow
        # enough that the first hand is already a decision.
        starting_chips=1500,
        # From 10 up, and stopping one rung short of the top: the buy-in here
        # is not a prize pool but four bounties, so a rung is worth a quarter of
        # what the same rung is worth in a format that pays places, and the very
        # top of the ladder belongs to the games that play for the whole pot.
        stakes=LADDER_FROM_10[:-1],
        blinds=(
            (50, 100, 0),
            (75, 150, 0),
            (100, 200, 25),
            (150, 300, 50),
            (250, 500, 75),
            (400, 800, 100),
            (600, 1200, 150),
            (1000, 2000, 250),
            # As everywhere else here: the ladder has to outlast the chips,
            # because the last level never raises. Four stacks of 1,500 is
            # 6,000, so the last big blind has to be able to swallow the table
            # between two players — which is what the test on this checks.
            (1500, 3000, 400),
        ),
        # A minute a level. Four shallow stacks and no decision after the flop
        # means hands take seconds, and the promise is three or four minutes.
        level_minutes=1,
        # Nothing plays for a place. The structure is here because the coin
        # settlement reads one, and it divides a pot of zero — see coin_pot,
        # where the whole buy-in has gone to the heads instead.
        payouts=((1, "1st", 100),),
        duration="3-4 min",
        time_bank_seconds=8,
        showdown_seconds=3,
        all_in_or_fold=True,
        mystery_bounty=True,
    ),
}

# The order the lobby draws them in, and the order a test walks them in.
FORMAT_KEYS = ("spingo", "hu", "sixmax", "allinfold")

# Every Tournament.format that belongs to this file. The lobby's tournament
# list, the management permissions and the join endpoint all ask this question:
# these are games nobody hosts, nobody browses, and nobody registers for in the
# ordinary way.
FAST_TOURNAMENT_FORMATS = ("spingo", "sitngo", "allinfold")


def format_for(key):
    """The format with this key, or None."""
    return FORMATS.get(str(key or ""))


def is_tier(key, stake) -> bool:
    """Whether this is a table anybody is actually offered."""
    fmt = format_for(key)
    return fmt is not None and stake in fmt.stakes


def key_for_tournament(tournament):
    """Which format a finished row was, read back off the row.

    Sit n Gos are told apart by their seat count, because that is genuinely the
    only difference between them — a second column saying so could disagree with
    the table it describes.
    """
    fmt = getattr(tournament, "format", "standard")
    # The formats that have a column to themselves need no working out. Only
    # the Sit n Gos share one, and only they are told apart by seat count.
    if fmt in ("spingo", "allinfold"):
        return fmt
    if fmt != "sitngo":
        return None
    seats = tournament.players_per_table or 0
    return next(
        (one.key for one in FORMATS.values()
         if one.tournament_format == "sitngo" and one.seats == seats),
        None,
    )


def level_rows(fmt) -> list:
    """The blind ladder, as BlindLevel kwargs.

    Timed rather than hand-counted: these formats promise minutes, and a promise
    measured in hands is not one the clock can keep.
    """
    return [
        {
            "level_number": index,
            "is_break": False,
            "small_blind": small_blind,
            "big_blind": big_blind,
            "ante": ante,
            "duration_hands": None,
            "duration_minutes": fmt.level_minutes,
        }
        for index, (small_blind, big_blind, ante) in enumerate(fmt.blinds, 1)
    ]


def payout_structure(fmt) -> list:
    return [
        {"place": place, "label": label, "percentage": percentage}
        for place, label, percentage in fmt.payouts
    ]


def tournament_defaults(fmt, stake: int) -> dict:
    """The whole tournament configuration for one tier, bar the host.

    Every setting these formats do not offer is pinned here rather than left to
    the model default, so a fast game cannot drift when a default changes for the
    tournaments people actually configure.
    """
    if fmt.draws_multiplier:
        # One source of truth for the Spin n Go: it had these numbers first and
        # its own tests pin them.
        return spingo.tournament_defaults(stake)

    return {
        "format": fmt.tournament_format,
        "name": f"{fmt.label} · {stake}",
        "game_type": "nlh",
        "buy_in_coins": stake,
        "buy_in_cents": 0,
        "starting_chips": fmt.starting_chips,
        "max_players": fmt.seats,
        "players_per_table": fmt.seats,
        # The field is the people who sat down. Nobody arrives late to a game
        # that starts the moment it is full, and nobody buys back into one.
        "late_reg_level": 0,
        "allow_rebuys": False,
        "max_rebuys": 0,
        "rebuy_level": 0,
        "time_bank_seconds": fmt.time_bank_seconds,
        "time_bank_refill_rule": "none",
        "showdown_seconds": fmt.showdown_seconds,
        "payout_structure": payout_structure(fmt),
        # The whole buy-in goes onto a head, so the places divide nothing —
        # coin_pot works that out from these two rather than being told. The
        # amount is coins, in a field named for cents: every bounty amount in
        # this app is an opaque integer, and in a coin game the unit is coins.
        **({
            "bounty_mode": "mystery",
            "bounty_cents": stake,
            # No late registration and no rebuys above, so the field is closed
            # from the first hand and the envelopes open with it.
            "mystery_release": "reg_closed",
            # Four heads, four envelopes. The one nobody draws is the winner's.
            "mystery_winner_keeps": True,
        } if fmt.mystery_bounty else {
            "bounty_mode": "none",
            "bounty_cents": 0,
        }),
    }


def pot_coins(fmt, stake: int, entries: int, multiplier: int = 0) -> int:
    """What is being played for.

    A Sit n Go pays out what was paid in. A Spin n Go pays the draw, which is
    more than was paid in as often as it is less and averages out to exactly the
    buy-ins that were.
    """
    if fmt.draws_multiplier:
        return spingo.prize_coins(stake, multiplier)
    # Bounties or places, it is the same coins: everything paid in is played
    # for, and in All In or Fold it is played for a knockout at a time.
    return max(0, stake) * max(0, entries)
