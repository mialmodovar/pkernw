"""Friends: who you play with, and what is between you.

This is what watching turned into. Watching was a private list of faces — you
added somebody, they were never told, and neither of you could see anything
about the other that a stranger could not. Everything people actually wanted
from it needed two-sidedness: knowing they have you too, and having something
between you worth comparing.

So a friendship is asked for and agreed, and that is the whole of the ceremony.
No blocking, no privacy settings, no follower counts. One row per pair, in the
direction it was asked in — see the Friendship model — which means every read
here has to look both ways, and every read here does.

What is between two friends is the other half, and it lives in battle.py.
"""

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import Friendship
from .people import people_payload
from .watching import presence

User = get_user_model()


def row_between(user, other):
    """The friendship between these two, asked in either direction, or None."""
    return (
        Friendship.objects
        .filter(
            Q(requester=user, addressee=other) | Q(requester=other, addressee=user),
        )
        .first()
    )


def standing(user, other) -> str:
    """What these two are to each other, in one word.

    The four states a button has to draw, and the reason they are named from the
    asking rather than from the row: "asked" and "asked you" are the same row
    read from its two ends, and the person looking needs to know which end they
    are on.
    """
    if user == other:
        return "self"
    row = row_between(user, other)
    if row is None:
        return "none"
    if row.status == Friendship.ACCEPTED:
        return "friends"
    return "asked" if row.requester == user else "asked_you"


def friend_ids(user) -> set:
    """Every user id this player is actually friends with."""
    rows = Friendship.objects.filter(
        Q(requester=user) | Q(addressee=user), status=Friendship.ACCEPTED,
    ).values_list("requester_id", "addressee_id")
    return {
        addressee if requester == user.id else requester
        for requester, addressee in rows
    }


def are_friends(user, other) -> bool:
    return Friendship.objects.filter(
        Q(requester=user, addressee=other) | Q(requester=other, addressee=user),
        status=Friendship.ACCEPTED,
    ).exists()


def ask(user, other):
    """Ask somebody, or say yes to them having asked you.

    One action rather than two endpoints, because from the client's side it is
    one button: pressing "Add" on somebody who has already asked you can only
    sensibly mean yes. Asking again changes nothing and is not an error — a
    double tap on a slow connection is not a thing to be told off for.
    """
    row = row_between(user, other)
    if row is None:
        asked = Friendship.objects.create(requester=user, addressee=other)
        # Rung rather than left to be found: a request nobody notices is the
        # whole feature failing quietly. See accounts/inbox.py.
        from .inbox import tell_about_friend_request

        tell_about_friend_request(asked)
        return asked
    if row.status == Friendship.ACCEPTED:
        return row
    if row.addressee == user:
        # They asked first. Pressing the button is the yes.
        row.status = Friendship.ACCEPTED
        row.accepted_at = timezone.now()
        row.save(update_fields=["status", "accepted_at"])
    return row


def part(user, other) -> bool:
    """Undo whatever there was: unfriend, take back an ask, or turn one down.

    All three are the same row going away, and telling them apart in the API
    would only be telling them apart in the API — a friendship that has ended
    and one that never started look identical to everybody afterwards.
    """
    deleted, _ = Friendship.objects.filter(
        Q(requester=user, addressee=other) | Q(requester=other, addressee=user),
    ).delete()
    return bool(deleted)


def lists_for(user) -> dict:
    """The three lists a friends panel draws, with presence on all of them.

    Asks you have received come first in the client for a reason — they are the
    only ones that want doing something about — but they are all built here,
    together, because they are one read of the same table.
    """
    rows = list(
        Friendship.objects
        .filter(Q(requester=user) | Q(addressee=user))
        .select_related("requester", "addressee")
    )
    friends, incoming, outgoing = [], [], []
    for row in rows:
        other = row.addressee if row.requester_id == user.id else row.requester
        if row.status == Friendship.ACCEPTED:
            friends.append(other)
        elif row.requester_id == user.id:
            outgoing.append(other)
        else:
            incoming.append(other)

    everybody = friends + incoming + outgoing
    here = presence([one.id for one in everybody])
    cards = people_payload(everybody)
    return {
        "friends": [{**cards[one.id], **here[one.id]} for one in friends],
        "incoming": [{**cards[one.id], **here[one.id]} for one in incoming],
        "outgoing": [{**cards[one.id], **here[one.id]} for one in outgoing],
    }


@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def friends(request):
    """The lists, and the one way to add to them."""
    if request.method == "POST":
        username = str(request.data.get("username") or "").strip()
        if not username:
            return Response({"error": "Who?"}, status=status.HTTP_400_BAD_REQUEST)
        target = User.objects.filter(username__iexact=username).first()
        if target is None:
            return Response(
                {"error": f"No player called {username}."}, status=status.HTTP_404_NOT_FOUND,
            )
        if target == request.user:
            return Response(
                {"error": "You are already your own best friend."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ask(request.user, target)

    return Response(lists_for(request.user))


@api_view(["DELETE"])
@permission_classes([permissions.IsAuthenticated])
def unfriend(request, username):
    """Remove a friend, take back an ask, or turn one down."""
    target = User.objects.filter(username__iexact=username).first()
    if target is not None:
        part(request.user, target)
    return Response(status=status.HTTP_204_NO_CONTENT)
