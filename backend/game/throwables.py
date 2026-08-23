"""What can be thrown across a table, and at whom.

The list is closed and lives on the server. A client that could name the thing
it throws could throw anything at all — a slur, a URL, an image — at somebody
who never asked to see it. Here it can only pick one of these, and the worst
anybody can do is hit you with a rubber chicken.

Some of them cost coins. Which ones is also the server's business: a price
enforced only in the shop is not a price.
"""

# Ids, not glyphs. What each one looks like is the client's business; what may
# be thrown is not.
FREE_THROWABLES = (
    "tomato",
    "egg",
    "beer",
    "chip",
    "shoe",
    "chicken",
    "rose",
    "snowball",
)

# The rest, and what they cost. Everything already in use stays free — a player
# who has been throwing tomatoes all month should not find them behind a till.
THROWABLE_PRICES = {
    "banana": 100,
    "ice": 100,
    "water": 100,
    "coffee": 150,
    "pie": 150,
    "fish": 150,
    "duck": 150,
    "cake": 200,
    "brick": 200,
    "confetti": 200,
    "cigar": 250,
    "skull": 250,
    "bomb": 300,
    "octopus": 300,
    "lightning": 300,
    "crown": 400,
    "anvil": 400,
}

THROWABLES = FREE_THROWABLES + tuple(THROWABLE_PRICES)


def clean_item(value):
    """The item if it is one of ours, otherwise None."""
    item = str(value or "").strip().lower()
    return item if item in THROWABLES else None


def price_of(item) -> int:
    """What it costs. Zero for the ones everybody has."""
    return THROWABLE_PRICES.get(item, 0)


def is_free(item) -> bool:
    return item in FREE_THROWABLES


def unlock_key(item) -> str:
    """How a bought throwable is filed in the shop's records."""
    return f"throwable:{item}"
