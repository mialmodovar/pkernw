"""The side games, and what a wager on one is worth.

A side game is something you play *at* the table without playing the hand:
calling who wins the pot you folded out of, and blackjack against the dealer
later. They have nothing in common mechanically, so what is shared is exactly
this — an id, what a stake may be, and how a winning wager pays.

Everything here is pure. A game is a description plus an arithmetic rule, and
neither needs a database to be right.
"""

from dataclasses import dataclass
from typing import Callable, Optional


@dataclass(frozen=True)
class SideGame:
    id: str
    name: str
    blurb: str
    min_stake: int
    max_stake: int
    # What a winning wager returns, the stake included. The second argument is
    # whatever that game counts as odds — for a player bet, how many players
    # were still in when the call was made.
    payout: Callable[[int, int], int]


def _player_bet_payout(stake: int, contenders: int) -> int:
    """Backing one of N players pays N times the stake.

    Fair if every player were equally likely, which they are not — but it is a
    rule anybody can hold in their head, and it is what makes calling a hand
    early worth more than calling it once everyone else has folded. Six-handed
    on the flop pays six; heads-up on the river pays two.
    """
    return stake * max(1, contenders)


PLAYER_BET = SideGame(
    id="player_bet",
    name="Call the hand",
    blurb="Back who takes the pot you folded out of. Pays out by how many are still in.",
    min_stake=5,
    max_stake=500,
    payout=_player_bet_payout,
)

GAMES = {game.id: game for game in (PLAYER_BET,)}


def game_for(game_id: str) -> Optional[SideGame]:
    return GAMES.get(game_id)


def clean_stake(game: SideGame, value) -> Optional[int]:
    """A stake, or None if it is not one.

    Refused rather than clamped: a player who asked for 10,000 and was quietly
    given 500 has been charged something they did not agree to.
    """
    try:
        stake = int(value)
    except (TypeError, ValueError):
        return None
    if stake < game.min_stake or stake > game.max_stake:
        return None
    return stake
