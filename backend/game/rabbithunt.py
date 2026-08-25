"""What was never dealt, and what it costs to look.

A hand that ends before the river leaves cards in the deck, and the question
"what would have come?" is the loudest one at any table. The engine has always
dealt them; what it did with them was broadcast them to everybody, and the client
hid them behind a button until somebody asked. That made the answer free, and it
also made it private in the least useful way: the one thing that makes rabbit
hunting fun at a live table is that everyone watches the person who could not
help themselves.

So it is a purchase now. Five coins, from the wallet — never from the stack,
because nothing bought with coins may ever touch the chips a hand is played for.
The cards stay on the server until somebody pays for them, which is the only
thing that makes them worth paying for, and who paid is announced to the table,
which is the part that is actually poker.

Pure, and tested: a book of what was left in the deck and who has bought a look
at it, with no engine and no database behind it. The two hosts that run tables —
the tournament coordinator and the cash room — both keep their books here rather
than each inventing one.
"""

# What a look costs. Small on purpose: it should be an easy yes several times a
# night, not a decision. The price is the server's, and the client is told it
# rather than asked, so it can never be the thing that is negotiated.
PRICE = 5


def open_book(cards, board) -> dict:
    """A hand's worth of unused deck, and nobody having paid for it yet.

    `board` is what the board would have been — the cards that came plus the
    ones that did not — because that is the more useful picture and working it
    out again on the client means sending the same cards twice.
    """
    return {"cards": list(cards or []), "board": list(board or []), "buyers": {}}


def offer(book) -> dict:
    """What the whole table is told: that there is something to see, and the
    price of it. Never the cards — the cards are what is being sold."""
    if not book or not book["cards"]:
        return {"count": 0, "price": PRICE, "buyers": []}
    return {
        "count": len(book["cards"]),
        "price": PRICE,
        # Anybody who paid before this client arrived, so a reload or a late
        # spectator sees the same table as everybody else.
        "buyers": buyers(book),
    }


def buyers(book) -> list:
    """Who has paid, in the order they paid."""
    if not book:
        return []
    return [dict(one) for one in book["buyers"].values()]


def may_buy(book, user_id) -> bool:
    """Whether this is a look that can still be sold.

    Twice is refused rather than charged: the cards are already on that
    player's screen, and a second click is a slip, not a second look.
    """
    if not book or not book["cards"]:
        return False
    return user_id not in book["buyers"]


def record(book, user_id, name="", seat=None) -> dict:
    """Write the sale down and hand back the row the table is told about."""
    row = {"user_id": user_id, "name": name or "", "seat": seat}
    book["buyers"][user_id] = row
    return dict(row)
