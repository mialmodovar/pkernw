"""Coins: where they come from, where they go.

Two grants and two moves. You get an opening balance the first time anybody
asks what your balance is, you can take a top-up once a day, and everything
else is a stake going out or a payout coming in.

The eligibility arithmetic is pure and sits at the top; everything below it
needs a database and takes a row lock, because a stake placed on one socket
while a payout lands on another must not read the same balance twice.
"""

from django.db import transaction
from django.utils import timezone

from .models import CoinLedger, Unlock, Wallet

# What a new player starts with, and what a day is worth. Enough of an opening
# balance to play for a week without the faucet, so nobody's first evening is
# spent waiting for tomorrow.
SIGNUP_COINS = 500
DAILY_COINS = 200


def can_claim_daily(last_claim_at, now=None) -> bool:
    """Whether the daily is available.

    A calendar day rather than a rolling twenty-four hours: "tomorrow" is an
    answer, and "at 03:47" is a punishment for having logged in late once.
    """
    if last_claim_at is None:
        return True
    now = now or timezone.now()
    return timezone.localtime(last_claim_at).date() < timezone.localtime(now).date()


def next_claim_at(last_claim_at, now=None):
    """When the next daily becomes available, or None if it already is."""
    if can_claim_daily(last_claim_at, now):
        return None
    now = now or timezone.now()
    local = timezone.localtime(now)
    tomorrow = (local + timezone.timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0,
    )
    return tomorrow


def wallet_for(user) -> Wallet:
    """This player's wallet, opening it with their starting coins if new.

    Created on demand rather than by a signal, like Profile: everybody who
    already had an account gets their opening balance the first time they look,
    and there is no migration that has to walk the user table.
    """
    wallet = Wallet.objects.filter(user=user).first()
    if wallet is not None:
        return wallet

    with transaction.atomic():
        wallet, created = Wallet.objects.get_or_create(user=user, defaults={"balance": SIGNUP_COINS})
        if created:
            CoinLedger.objects.create(
                user=user, amount=SIGNUP_COINS, reason="signup", balance_after=wallet.balance,
            )
    return wallet


def _move(user, amount: int, reason: str, memo: str = "", require_funds: bool = False):
    """Move coins, under a row lock, writing the ledger as it goes.

    Returns the wallet, or None when `require_funds` and there are not enough.
    """
    wallet_for(user)
    with transaction.atomic():
        wallet = Wallet.objects.select_for_update().get(user=user)
        if require_funds and wallet.balance + amount < 0:
            return None
        wallet.balance += amount
        wallet.save(update_fields=["balance"])
        CoinLedger.objects.create(
            user=user, amount=amount, reason=reason, memo=memo, balance_after=wallet.balance,
        )
    return wallet


def grant(user, amount: int, reason: str, memo: str = "") -> Wallet:
    """Coins in. Never refused."""
    return _move(user, abs(amount), reason, memo)


def spend(user, amount: int, reason: str, memo: str = ""):
    """Coins out, or None if the wallet cannot cover it."""
    return _move(user, -abs(amount), reason, memo, require_funds=True)


def claim_daily(user):
    """Take today's coins, or None if today's are already taken."""
    wallet = wallet_for(user)
    with transaction.atomic():
        wallet = Wallet.objects.select_for_update().get(user=user)
        if not can_claim_daily(wallet.last_claim_at):
            return None
        wallet.balance += DAILY_COINS
        wallet.last_claim_at = timezone.now()
        wallet.save(update_fields=["balance", "last_claim_at"])
        CoinLedger.objects.create(
            user=user, amount=DAILY_COINS, reason="daily", balance_after=wallet.balance,
        )
    return wallet


def owned_items(user) -> set:
    """Everything this player has bought."""
    return set(Unlock.objects.filter(user=user).values_list("item", flat=True))
