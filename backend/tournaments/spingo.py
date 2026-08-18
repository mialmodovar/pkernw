"""Spin n Go: three players, fifteen big blinds, and a number drawn out of a hat.

The format is one tournament shape with nothing to configure — three seats, a
coin stake, and blinds that climb every two minutes until somebody has all the
chips. What makes it a Spin n Go rather than a fast three-hander is the draw: the
prize is the buy-in multiplied by a number picked when the third player sits, so
most games are worth two buy-ins and one in two thousand is worth a hundred.

The weights below average out to exactly three, which is what three players paid
in. Nothing is raked off. These are coins, not money, and a house edge on a
currency the house prints is only a slower way of emptying wallets.

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
# are what tunes the average; see expected_multiplier, which a test pins to 3.
MULTIPLIERS = (
    (7200, 2),
    (1700, 3),
    (700, 5),
    (275, 10),
    (90, 25),
    (30, 50),
    (5, 100),
)

TOTAL_WEIGHT = sum(weight for weight, _ in MULTIPLIERS)

# Two-minute levels. The engine already advances a timed level at a hand
# boundary, so a level never cuts a hand in half.
LEVEL_MINUTES = 2

# (small blind, big blind, ante). Seven is more than a game of 4500 chips needs;
# the last level is the one that never raises, and reaching it would mean three
# players had somehow kept each other alive for a quarter of an hour.
BLINDS = (
    (50, 100, 0),
    (75, 150, 20),
    (100, 200, 25),
    (150, 300, 40),
    (200, 400, 50),
    (300, 600, 75),
    (400, 800, 100),
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
    """The average draw, exactly. Three: what three players paid in."""
    return Fraction(
        sum(weight * multiplier for weight, multiplier in MULTIPLIERS),
        TOTAL_WEIGHT,
    )


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
        }
        if stake is not None:
            row["prize_coins"] = prize_coins(stake, multiplier)
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
        # Winner takes the drawn pool. The percentage is still how it is paid
        # out, so the coin settlement needs no special case for the format.
        "payout_structure": [{"place": 1, "label": "1st", "percentage": 100}],
        "bounty_mode": "none",
        "bounty_cents": 0,
    }
