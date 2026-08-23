"""Coins in and out of a tournament.

The euro ledger next door records what people agreed and never moves anything.
This does the opposite: coins are the app's own currency, so a coin buy-in is
actually taken off the wallet on the way in and actually paid back to the places
on the way out.

Every move is memoed with the tournament it belongs to, and the memo is what
makes paying out safe to attempt twice — the engine's finally-block runs on paths
that can be reached more than once, and a prize granted twice is coins minted out
of nothing.

The arithmetic of splitting a pot already exists in ledger._prizes_for, and is
reused rather than written again: the same rounding rule, with the remainder to
first place, whichever currency the tournament was played for.
"""

from django.db import transaction

from sidegames.economy import grant, spend, wallet_for
from sidegames.models import CoinLedger

from .ledger import _prizes_for


def stake_memo(tournament_id) -> str:
    """What every coin move for this tournament is stamped with."""
    return f"tournament:{tournament_id}"


def is_coin_game(tournament) -> bool:
    return (tournament.buy_in_coins or 0) > 0


def charge_entry(user, tournament) -> bool:
    """Take one buy-in off this player's wallet. False if they cannot cover it.

    Called for a first entry and for a rebuy alike — a rebuy is another buy-in,
    and the wallet has no opinion about which it is.
    """
    if not is_coin_game(tournament):
        return True
    wallet = spend(user, tournament.buy_in_coins, "stake", memo=stake_memo(tournament.id))
    return wallet is not None


def refund_entry(user, tournament) -> None:
    """Give a buy-in back, for a seat given up before anything was played."""
    if not is_coin_game(tournament):
        return
    grant(user, tournament.buy_in_coins, "refund", memo=stake_memo(tournament.id))


def balance_of(user) -> int:
    """This player's coins, opening a wallet if they have never had one."""
    return wallet_for(user).balance


def coin_pot(tournament, entries: int) -> int:
    """The coins the payout structure divides.

    A tournament pays out what was paid in. A Spin n Go pays out the draw — one
    buy-in times the multiplier — which is more than was paid in as often as it
    is less, and averages out to exactly the three buy-ins that were.

    Where part of every buy-in went onto a head instead, that part is not in
    here: it is paid out knockout by knockout (see mystery_prizes below), and
    counting it twice would hand out coins nobody paid in. In All In or Fold the
    whole buy-in goes that way, so this is zero and the places play for nothing
    — which is the format.
    """
    if not is_coin_game(tournament):
        return 0
    # A drawn prize is the one case where the pot has nothing to do with how
    # many people paid in. Everything else, tournaments included, is the buy-ins.
    if (tournament.spin_multiplier or 0) > 0:
        return (tournament.buy_in_coins or 0) * tournament.spin_multiplier

    from .bounties import BountyConfig, prize_pool_share_cents

    share = prize_pool_share_cents(
        BountyConfig.from_tournament(tournament), tournament.buy_in_coins or 0,
    )
    return share * max(0, entries)


def mystery_prizes(tournament, players) -> dict:
    """What each player takes out of a coin mystery pool, by user id.

    What they drew, plus — for the winner — whatever was never drawn at all.
    In All In or Fold that last part is exactly one envelope, the one that was
    on the winner's own head; in a tournament where the pool is cut one envelope
    per knockout it is usually nothing, and is whatever a hand that busted two
    players at once left behind.

    The engine records a draw as `bounty_won_cents`, and in a coin game the
    integer on a head is coins. That is the same arithmetic in a different
    currency rather than a special case: see bounties.py, where every amount is
    an opaque integer.
    """
    from .bounties import BountyConfig

    bounty = BountyConfig.from_tournament(tournament)
    if not bounty.is_mystery:
        return {}

    prizes = {
        player.user_id: max(0, player.bounty_won_cents or 0)
        for player in players
        if (player.bounty_won_cents or 0) > 0
    }

    entries = sum(1 + (player.rebuy_count or 0) for player in players)
    pool = bounty.amount_cents * entries
    unclaimed = pool - sum(prizes.values())
    if unclaimed > 0:
        champion = next((one for one in players if one.finish_position == 1), None)
        if champion is not None:
            prizes[champion.user_id] = prizes.get(champion.user_id, 0) + unclaimed
    return prizes


def settle_tournament_coins(tournament) -> bool:
    """Pay the coin prizes. Safe to call twice.

    Skipped when the tournament was not played for coins, or when nobody said
    who wins — a pot with no structure behind it is not something to guess at.
    """
    if not is_coin_game(tournament):
        return False

    memo = stake_memo(tournament.id)
    with transaction.atomic():
        if CoinLedger.objects.filter(reason="payout", memo=memo).exists():
            return False  # already paid

        players = list(tournament.players.select_related("user"))
        if not players:
            return False

        # Each rebuy was another buy-in charged, so it is also another buy-in in
        # the pot. A Spin n Go allows none, and coin_pot ignores the count there.
        entries = sum(1 + (player.rebuy_count or 0) for player in players)
        pot = coin_pot(tournament, entries)
        payouts = tournament.payout_structure or []
        prizes = _prizes_for(
            pot, payouts, {player.user_id: player.finish_position for player in players},
        ) if pot > 0 and payouts else {}

        # And whatever the heads paid out, which in All In or Fold is the whole
        # of it. Added rather than replacing: a coin tournament may perfectly
        # well pay places and bounties both.
        for user_id, amount in mystery_prizes(tournament, players).items():
            prizes[user_id] = prizes.get(user_id, 0) + amount

        if not prizes:
            return False
        users_by_id = {player.user_id: player.user for player in players}

        # Inside the same transaction as the already-paid check above, and in a
        # settled order. The check is only a guard against paying twice if the
        # rows it looked for are written before anything else can look.
        paid = False
        for user_id in sorted(prizes):
            amount = prizes[user_id]
            if amount <= 0 or user_id not in users_by_id:
                continue
            grant(users_by_id[user_id], amount, "payout", memo=memo)
            paid = True
    return paid


def settle_finished_coins(tournament_id) -> bool:
    """Called when a tournament reaches its end."""
    from .models import Tournament

    tournament = Tournament.objects.filter(id=tournament_id).first()
    if tournament is None:
        return False
    return settle_tournament_coins(tournament)
