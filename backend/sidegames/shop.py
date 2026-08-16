"""What coins buy.

One shelf so far — throwables — but the shape is the point: a catalogue of
items with an id, a price and a way of telling whether somebody already owns
one. Anything else that becomes buyable joins the list rather than growing its
own endpoint.
"""

from django.db import transaction

from game.throwables import THROWABLES, is_free, price_of, unlock_key

from .economy import spend, wallet_for
from .models import Unlock


def catalogue(user=None) -> list:
    """Everything for sale, with what this player already has."""
    owned = set()
    if user is not None:
        owned = set(Unlock.objects.filter(user=user).values_list("item", flat=True))

    return [
        {
            "item": item,
            "key": unlock_key(item),
            "shelf": "throwable",
            "price": price_of(item),
            # Free things are owned by everybody, which is the only sense in
            # which a client needs to tell them apart.
            "owned": is_free(item) or unlock_key(item) in owned,
        }
        for item in THROWABLES
    ]


def owns_throwable(user, item) -> bool:
    """Whether this player may throw this.

    Checked on the throw, not only in the shop: a price enforced at the till is
    not a price, it is a suggestion.
    """
    if is_free(item):
        return True
    return Unlock.objects.filter(user=user, item=unlock_key(item)).exists()


def buy_throwable(user, item):
    """Buy one. Returns the wallet, or a string saying why not."""
    if item not in THROWABLES:
        return "No such thing."
    if is_free(item):
        return "That one is free."

    key = unlock_key(item)
    if Unlock.objects.filter(user=user, item=key).exists():
        return "You already have that."

    price = price_of(item)
    with transaction.atomic():
        wallet = spend(user, price, "purchase", memo=key)
        if wallet is None:
            return "Not enough coins."
        # Inside the same transaction as the spend, so a purchase can never
        # take the coins without handing over the thing.
        Unlock.objects.create(user=user, item=key, price_paid=price)
    return wallet


__all__ = ["buy_throwable", "catalogue", "owns_throwable", "wallet_for"]
