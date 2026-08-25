"""What a player looks like in a list.

The same five fields every time — the name they go by, the face, the ring round
it — because a face in the friends panel, a face in a search result and a face
on a profile card are the same face, and three places building it three ways is
three places for one of them to be missing a border.

Two queries whatever the length of the list, which is the other reason it is one
function: the version this replaced did a `values_list` per caller and it was
copied about as the lists multiplied.
"""

from .avatars import avatar_url
from .naming import shown_name
from .models import AvatarImage, Profile

# What somebody has instead of a face until they choose one: the back of a
# playing card.
DEFAULT_EMOJI = "\U0001F0CF"


def people_payload(users) -> dict:
    """The card for each of these users, keyed by user id."""
    users = list(users)
    ids = [user.id for user in users]
    profiles = {
        row[0]: row[1:]
        for row in Profile.objects.filter(user_id__in=ids)
        .values_list("user_id", "avatar_emoji", "display_name", "avatar_border")
    }
    stamps = dict(
        AvatarImage.objects.filter(user_id__in=ids).values_list("user_id", "updated_at")
    )

    cards = {}
    for user in users:
        emoji, display, border = profiles.get(user.id) or ("", "", "")
        cards[user.id] = {
            "username": user.username,
            "display_name": shown_name(user.username, display),
            "avatar_emoji": emoji or DEFAULT_EMOJI,
            "avatar_border": border or "",
            "avatar_url": avatar_url(user.id, stamps.get(user.id)),
        }
    return cards
