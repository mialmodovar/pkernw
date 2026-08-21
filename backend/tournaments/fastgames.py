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

    @property
    def big_blinds(self) -> int:
        """The starting stack, in big blinds — the only honest way to say how
        deep a format is, since the chip numbers are arbitrary."""
        return self.starting_chips // self.blinds[0][1]


# Two minutes a level everywhere. It is what makes these turbos, and one number
# across all three means a player who has played one knows the pace of the rest.
LEVEL_MINUTES = 2

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
        stakes=(10, 50),
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
        stakes=(25, 100),
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
}

# The order the lobby draws them in, and the order a test walks them in.
FORMAT_KEYS = ("spingo", "hu", "sixmax")

# Every Tournament.format that belongs to this file. The lobby's tournament
# list, the management permissions and the join endpoint all ask this question:
# these are games nobody hosts, nobody browses, and nobody registers for in the
# ordinary way.
FAST_TOURNAMENT_FORMATS = ("spingo", "sitngo")


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
    if fmt == "spingo":
        return "spingo"
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
        "bounty_mode": "none",
        "bounty_cents": 0,
    }


def pot_coins(fmt, stake: int, entries: int, multiplier: int = 0) -> int:
    """What is being played for.

    A Sit n Go pays out what was paid in. A Spin n Go pays the draw, which is
    more than was paid in as often as it is less and averages out to exactly the
    buy-ins that were.
    """
    if fmt.draws_multiplier:
        return spingo.prize_coins(stake, multiplier)
    return max(0, stake) * max(0, entries)
