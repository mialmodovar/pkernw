"""Rings around a face.

The second thing coins buy, and the first that other people see all evening. A
throwable is a moment; a border is what your seat looks like for the whole
night, at every table and in every list — which is exactly why it is worth
buying and exactly why the server has to own the list.

Ids only. What each one looks like is the client's business (see
frontend/src/components/borders.js); which of them exist, what they cost and
whether you own one is not, for the same reason the throwables are a closed
list: a border is drawn on other people's screens.
"""

# Everybody starts with none, which is the plain ring the app has always drawn.
NO_BORDER = ""

# id -> what it costs. Priced against the throwables: a border is worn all night
# and by everybody who looks at you, so the cheap ones are about a throwable and
# the loud ones cost a week of missions.
BORDER_PRICES = {
    "silver": 150,
    "copper": 150,
    "emerald": 250,
    "sapphire": 250,
    "crimson": 350,
    "violet": 350,
    "gold": 600,
    "rainbow": 900,
}

BORDERS = tuple(BORDER_PRICES)


def clean_border(value):
    """The border if it is one of ours, or "" for none at all."""
    border = str(value or "").strip().lower()
    return border if border in BORDER_PRICES else NO_BORDER


def price_of(border) -> int:
    return BORDER_PRICES.get(border, 0)


def unlock_key(border) -> str:
    """How a bought border is filed, beside the throwables in the same table."""
    return f"border:{border}"
