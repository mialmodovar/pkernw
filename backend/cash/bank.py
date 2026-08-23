"""Coins on and off the felt.

The one invariant this whole app rests on: a player's coins are either in their
wallet or in front of them on a table, and the two always add up to what they
had. Nothing else about a cash game is hard; this is, and only because it is
easy to write a path that takes coins out of a wallet and then fails before they
land on the felt.

So every move here is one transaction, and every one of them writes a ledger row
beside the wallet change — the same append-only ledger the side games use, so a
balance that cannot be explained is a balance somebody can walk backwards.

Three moves and no more: sit down with an amount, top up between hands, and
stand up with whatever is left.
"""

from django.db import transaction
from django.db.models import F

from sidegames.economy import grant, spend, wallet_for

from .models import CashSeat
from .stakes import clean_buy_in, stake_for, top_up_room


def table_memo(table_id) -> str:
    """What every ledger row for this table is filed under."""
    return f"cash:{table_id}"


def balance_of(user) -> int:
    return wallet_for(user).balance


def sit_down(table, user, amount, seat_number):
    """Take a seat, with coins off the wallet and onto the felt.

    Returns the seat, or a string saying why not. The seat row is written first
    and the coins moved inside the same transaction: a seat with no coins behind
    it is a player who cannot act, and coins with no seat are coins nobody can
    reach.
    """
    stake = stake_for(table.stake)
    if stake is None:
        return "That table has no stakes."
    if not table.is_open:
        return "That table is closed."

    coins = clean_buy_in(stake, amount, balance_of(user))
    if isinstance(coins, str):
        return coins

    with transaction.atomic():
        if CashSeat.objects.filter(table=table, user=user).exists():
            return "You are already at that table."
        if CashSeat.objects.filter(table=table, seat=seat_number).exists():
            return "Somebody just took that seat."

        wallet = spend(user, coins, "stake", memo=table_memo(table.id))
        if wallet is None:
            return "Not enough coins."
        return CashSeat.objects.create(
            table=table, user=user, seat=seat_number, stack=coins, bought_in=coins,
            # Dealt in from the next hand. Arriving mid-hand and being dealt
            # into it is the one thing a seat may never do.
            sitting_out=False,
        )


def top_up(seat, amount):
    """Bring more coins to a stack you already have.

    Only up to the table's maximum, and only between hands — the runner applies
    the new stack at the same moment it applies everything else, so a stack
    cannot grow in the middle of a hand somebody is betting into.
    """
    stake = stake_for(seat.table.stake)
    if stake is None:
        return "That table has no stakes."

    try:
        coins = int(amount)
    except (TypeError, ValueError):
        return "That is not an amount."
    if coins <= 0:
        return "That is not an amount."

    room = top_up_room(stake, seat.stack)
    if room <= 0:
        return "You are already at the table maximum."
    if coins > room:
        return f"You can add at most {room} here."
    if coins > balance_of(seat.user):
        return "Not enough coins."

    with transaction.atomic():
        wallet = spend(seat.user, coins, "stake", memo=table_memo(seat.table_id))
        if wallet is None:
            return "Not enough coins."
        # F() rather than read-modify-write: a pot landing on this stack
        # between the read and the write is the whole reason the stack is a
        # column rather than a number somebody is holding.
        CashSeat.objects.filter(pk=seat.pk).update(
            stack=F("stack") + coins, bought_in=F("bought_in") + coins,
        )
    seat.refresh_from_db()
    return seat


def stand_up(seat):
    """Leave, and take the stack with you.

    Everything in front of them goes back to the wallet — there is nothing to
    settle and nobody to pay, because in a cash game the settlement happened on
    every pot. Returns the coins handed back.
    """
    with transaction.atomic():
        locked = CashSeat.objects.select_for_update().filter(pk=seat.pk).first()
        if locked is None:
            return 0
        coins = max(0, locked.stack)
        user = locked.user
        table_id = locked.table_id
        locked.delete()
        if coins > 0:
            grant(user, coins, "payout", memo=table_memo(table_id))
    return coins


def cash_out_everybody(table):
    """Close the table and pay everybody back what is in front of them.

    For a club shutting a table with people still at it, and for the tests that
    check nothing is left behind. Hands in progress are the runner's business;
    this is what happens once there are none.
    """
    paid = 0
    for seat in list(CashSeat.objects.filter(table=table).select_related("user")):
        paid += stand_up(seat)
    return paid
