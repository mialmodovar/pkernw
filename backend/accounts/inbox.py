"""What is waiting for you: the bell in the header.

Two kinds of thing in this app are addressed to one person and outlive the
moment they happened — somebody asking to be friends, and somebody inviting you
to their tournament. Both used to be findable only by opening the panel they
lived in, which means both were missed by anybody who did not happen to look.

So they are also a list, read on arrival and topped up over the presence socket:
the bell shows what the server still has for you, and the socket adds to it while
you sit there. Nothing here is stored twice — an item is a friend request or an
invite, read out of the row that already exists, and it stops being in the bell
when that row is answered rather than when a "seen" flag is set somewhere.

Which is the whole design: no notifications table, no read/unread bookkeeping to
drift out of step with the thing it describes. A bell with two things in it means
there are two things to do.
"""

from django.db.models import Q
from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import Friendship
from .naming import shown_name
from .notify import notify_user
from .people import people_payload


def friend_request_items(user) -> list:
    """Asks somebody has sent this player and not had answered."""
    rows = list(
        Friendship.objects
        .filter(addressee=user, status=Friendship.PENDING)
        .select_related("requester")
        .order_by("-created_at")
    )
    cards = people_payload([row.requester for row in rows])
    return [
        {
            "kind": "friend_request",
            # Stable, and the same id the socket message carries, so one arriving
            # while the list is open replaces its own row rather than doubling it.
            "id": f"friend_request:{row.requester_id}",
            "at": row.created_at,
            "from": cards[row.requester_id],
            "title": f"{cards[row.requester_id]['display_name']} wants to be friends",
            # Where the answer is: the friends panel, which is the lobby.
            "path": "/?panel=friends",
        }
        for row in rows
    ]


def items_for(user) -> list:
    """Everything in the bell, newest first."""
    items = friend_request_items(user)
    items.sort(key=lambda item: item["at"], reverse=True)
    return items


def tell_about_friend_request(friendship) -> None:
    """Ring the bell of whoever has just been asked.

    Never raises and never blocks the ask: a friendship that was made must not
    fail because the person is offline and there was nobody to tell.
    """
    requester = friendship.requester
    name = shown_name(requester.username, getattr(requester.profile, "display_name", "")) \
        if hasattr(requester, "profile") else requester.username
    notify_user(friendship.addressee_id, {
        "type": "friend_request",
        "id": f"friend_request:{requester.id}",
        "kind": "friend_request",
        "title": f"{name} wants to be friends",
        "path": "/?panel=friends",
        "from": {"username": requester.username, "display_name": name},
    })


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def inbox(request):
    """What the bell has in it, asked once per page load."""
    return Response({"items": items_for(request.user)})
