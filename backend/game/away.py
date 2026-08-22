"""What "disconnected" means, now that the app is more than one table.

It used to mean one thing: this player's socket for this table closed. That was
true when a table was the only place you could be. It has not been true for a
while — there is a lobby, and a player can sit at three tables at once — so
walking over to the lobby to see what else is running lit up "DISCONNECTED" on
a seat whose owner was very much in the app, and switching between two of your
own tables did it to you at whichever one you were not looking at.

Disconnected means gone: no table socket anywhere, and the app itself not open.
Anything else is somebody who is here and looking at something else, and the
table already says that better than a label can — their clock is running.

Pure, because it is the sort of rule that reads as obvious and has three inputs.
"""


def truly_gone(*, app_open, other_tables):
    """Whether this player has actually left, having just closed one table.

    `app_open` is the presence socket — the app itself, from wherever in it.
    `other_tables` is whether they still hold a socket at another table.

    Either one means they are still here.
    """
    return not app_open and not other_tables


def label_for(*, app_open, at_this_table):
    """What a seat should say about somebody, in one word or none.

    Three states and only one of them is worth a badge. Sitting at the table is
    the ordinary case; being elsewhere in the app is not worth interrupting
    anybody about, since the seat's own clock already shows they are not acting;
    and being gone is the one thing the rest of the table needs to know, because
    it changes how long the night is about to take.
    """
    if at_this_table:
        return None
    return None if app_open else "disconnected"
