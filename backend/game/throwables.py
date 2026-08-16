"""What can be thrown across a table, and at whom.

The list is closed and lives on the server. A client that could name the thing
it throws could throw anything at all — a slur, a URL, an image — at somebody
who never asked to see it. Here it can only pick one of these, and the worst
anybody can do is hit you with a rubber chicken.
"""

# Ids, not glyphs. What each one looks like is the client's business; what may
# be thrown is not.
THROWABLES = (
    "tomato",
    "egg",
    "beer",
    "chip",
    "shoe",
    "chicken",
    "rose",
    "snowball",
)


def clean_item(value):
    """The item if it is one of ours, otherwise None."""
    item = str(value or "").strip().lower()
    return item if item in THROWABLES else None
