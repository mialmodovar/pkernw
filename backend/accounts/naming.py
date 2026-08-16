"""What a player is called, as against what they log in as.

The username is the identity: it keys the hand history, the ledger, the watch
list and every stats lookup, and it is what the login form asks for. The display
name is only what everybody else reads — on the felt, in chat, in the results —
and changing it rewrites none of the above.
"""

# Long enough for a real name with an initial, short enough to sit on a
# nameplate beside a stack and a VPIP without truncating.
DISPLAY_NAME_MAX = 24


def shown_name(username, display_name):
    """What to put in front of other players.

    Falls back to the username, which is what everybody had before display names
    existed and what a player gets back by clearing theirs.
    """
    return (display_name or "").strip() or username
