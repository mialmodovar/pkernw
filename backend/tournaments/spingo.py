"""Spin n Go: three players, fifteen big blinds, and a number drawn out of a hat.

The format is one tournament shape with nothing to configure — three seats, a
coin stake, and blinds that climb every two minutes until somebody has all the
chips. What makes it a Spin n Go rather than a fast three-hander is the draw: the
prize is the buy-in multiplied by a number picked when the third player sits, so
most games are worth two buy-ins and one in two thousand is worth a hundred.

The weights below average out to 3.166 buy-ins against the three that were paid
in. That is deliberate and it is not a rake in reverse by accident: coins are
the app's own currency, the house prints them daily anyway, and a game that pays
back a little more than it took is a better faucet than a bigger daily handout —
it arrives while somebody is playing rather than while they are logging in. The
cost is that every Spin n Go adds about five per cent of its own pool to the
coins in circulation, on top of the daily claim.

Above 25x the prize stops being winner-takes-all and pays all three seats. A
hundred-times game where two of the three walk away with nothing is the harshest
thing the format does, and the players who lost it were as much a part of it as
the one who won.

Everything here is arithmetic and constants: no database, no random state of its
own. The draw takes its generator as an argument so a test can pin it.
"""

from fractions import Fraction
import random

# The tiers on the lobby. Fixed in code rather than created by staff — nobody
# hosts a Spin n Go, so there is nobody to set its stake.
STAKES = (25, 50)

# Fifteen big blinds at the opening 50/100. Short enough that the format is
# decided by the cards it deals rather than by the clock.
STARTING_CHIPS = 1500

SEATS = 3

# (weight out of TOTAL_WEIGHT, multiplier applied to one buy-in). The weights
# are what tunes the average; see expected_multiplier, which a test pins.
#
# Read down the second column: most games are worth two buy-ins, one in a
# thousand is worth twenty-five, and one in a thousand games is worth a hundred.
# The tail is what anybody sits down for, so it is drawn twice as often as it
# used to be, and the flat two-times game is rarer than it was.
MULTIPLIERS = (
    (6855, 2),
    (1900, 3),
    (800, 5),
    (300, 10),
    (100, 25),
    (35, 50),
    (10, 100),
)

# From here up, the prize is shared. See PAYOUT_SHARED below.
SHARED_FROM = 25

# How a shared prize is split. The winner still takes the great majority of it —
# this is not a consolation prize, it is the difference between busting out of a
# hundred-times game with nothing and busting out of it with eight buy-ins.
PAYOUT_SHARED = (
    {"place": 1, "label": "1st", "percentage": 80},
    {"place": 2, "label": "2nd", "percentage": 12},
    {"place": 3, "label": "3rd", "percentage": 8},
)

PAYOUT_WINNER_TAKES_ALL = ({"place": 1, "label": "1st", "percentage": 100},)

TOTAL_WEIGHT = sum(weight for weight, _ in MULTIPLIERS)

# Two-minute levels. The engine already advances a timed level at a hand
# boundary, so a level never cuts a hand in half.
LEVEL_MINUTES = 2

# (small blind, big blind, ante). Far more levels than a game of 4500 chips will
# ever get through, on purpose: the engine never raises past the final level, so
# the ladder has to end somewhere nobody can sit. By the last one the big blind
# is most of the chips in play and the next hand decides it.
BLINDS = (
    (50, 100, 0),
    (75, 150, 20),
    (100, 200, 25),
    (150, 300, 40),
    (200, 400, 50),
    (300, 600, 75),
    (400, 800, 100),
    (600, 1200, 150),
    (1000, 2000, 250),
    (1500, 3000, 400),
)


def is_stake(stake) -> bool:
    """Whether this is one of the tiers on offer."""
    return stake in STAKES


def draw_multiplier(rng=None) -> int:
    """Pick a prize multiplier, weighted.

    The generator is an argument so the draw can be pinned in a test. Without
    one it uses the module-level `random`, which is seeded from the OS — this is
    not cryptography, but it must not be predictable from the last draw either.
    """
    rng = rng or random
    roll = rng.randrange(TOTAL_WEIGHT)
    for weight, multiplier in MULTIPLIERS:
        if roll < weight:
            return multiplier
        roll -= weight
    # Unreachable: the weights sum to TOTAL_WEIGHT. Returning the commonest
    # multiplier rather than None keeps a rounding mistake from firing a game
    # with no prize on it.
    return MULTIPLIERS[0][1]


def prize_coins(stake: int, multiplier: int) -> int:
    """What the winner takes: one buy-in, multiplied by the draw."""
    return max(0, int(stake)) * max(0, int(multiplier))


def expected_multiplier() -> Fraction:
    """The average draw, exactly.

    Above three — see the note at the top of the file. Returned as a fraction so
    a test can pin it to the digit rather than to a float that nearly matches.
    """
    return Fraction(
        sum(weight * multiplier for weight, multiplier in MULTIPLIERS),
        TOTAL_WEIGHT,
    )


def is_shared(multiplier: int) -> bool:
    """Whether a draw this big pays every seat rather than only the winner."""
    return int(multiplier or 0) >= SHARED_FROM


def payout_for(multiplier: int) -> list:
    """How a drawn pool is split, as payout_structure rows.

    Stamped onto the tournament at the moment of the draw rather than worked out
    at settlement, so the table, the lobby and the coin ledger all read the same
    split from the same row — and so a game already under way keeps the deal it
    started under if these numbers ever change.
    """
    rows = PAYOUT_SHARED if is_shared(multiplier) else PAYOUT_WINNER_TAKES_ALL
    return [dict(row) for row in rows]


def odds_table(stake: int | None = None) -> list:
    """The prize table, as the lobby prints it.

    Chances are percentages rather than one-in-N, because the interesting rows
    are the rare ones and "0.05%" reads better than "one in two thousand" in a
    column of seven.
    """
    rows = []
    for weight, multiplier in MULTIPLIERS:
        row = {
            "multiplier": multiplier,
            "chance_pct": float(Fraction(weight * 100, TOTAL_WEIGHT)),
            # Whether every seat is paid at this multiplier. The lobby says so
            # against the row rather than in a footnote: "one in a thousand" and
            # "and you get something for second" are the same sentence.
            "shared": is_shared(multiplier),
        }
        if stake is not None:
            pool = prize_coins(stake, multiplier)
            row["prize_coins"] = pool
            # What first place actually receives, which is the pool itself until
            # the pool is shared.
            row["winner_coins"] = pool * payout_for(multiplier)[0]["percentage"] // 100
        rows.append(row)
    return rows


def level_rows() -> list:
    """The blind structure, as BlindLevel kwargs.

    Timed rather than hand-counted: a Spin n Go promises three to five minutes,
    and a promise measured in hands is not one the clock can keep.
    """
    return [
        {
            "level_number": index,
            "is_break": False,
            "small_blind": small_blind,
            "big_blind": big_blind,
            "ante": ante,
            "duration_hands": None,
            "duration_minutes": LEVEL_MINUTES,
        }
        for index, (small_blind, big_blind, ante) in enumerate(BLINDS, 1)
    ]


def tournament_defaults(stake: int) -> dict:
    """The whole tournament configuration for a tier, bar the host.

    Every setting a Spin n Go does not offer is pinned here rather than left to
    the model default, so the format cannot drift when a default changes for
    tournaments that people actually configure.
    """
    return {
        "format": "spingo",
        "name": f"Spin n Go · {stake}",
        "game_type": "nlh",
        "buy_in_coins": stake,
        "buy_in_cents": 0,
        "starting_chips": STARTING_CHIPS,
        "max_players": SEATS,
        "players_per_table": SEATS,
        # No late registration and no rebuys: the field is the three people who
        # sat down, and the draw was made on there being three of them.
        "late_reg_level": 0,
        "allow_rebuys": False,
        "max_rebuys": 0,
        "rebuy_level": 0,
        # A short bank, because a fifteen-blind game is decided in seconds and a
        # thirty-second think from one player is a third of the format.
        "time_bank_seconds": 10,
        "time_bank_refill_rule": "none",
        "showdown_seconds": 3,
        # Winner takes the drawn pool — until the draw says otherwise. The row
        # is replaced at the moment the multiplier comes up (see payout_for),
        # and a game that never fires keeps this one.
        "payout_structure": payout_for(0),
        "bounty_mode": "none",
        "bounty_cents": 0,
    }
