"""Keeping an eye on other players.

One-directional and unannounced — see the Watch model. This is the list, the
two ways to change it, and nothing else: what a watched player has actually
been doing is answered by the profile endpoint next door in stats.py.
"""

from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from tournaments.models import TournamentPlayer

from .models import Profile, Watch

User = get_user_model()


@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def watching(request):
    if request.method == "POST":
        username = str(request.data.get("username") or "").strip()
        if not username:
            return Response({"error": "Who?"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            target = User.objects.get(username__iexact=username)
        except User.DoesNotExist:
            return Response({"error": f"No player called {username}."}, status=status.HTTP_404_NOT_FOUND)
        if target == request.user:
            return Response(
                {"error": "You already know how you are doing."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        Watch.objects.get_or_create(watcher=request.user, watched=target)

    watched_users = [watch.watched for watch in request.user.watching.select_related("watched")]
    profiles = dict(
        Profile.objects.filter(user__in=watched_users).values_list("user_id", "avatar_emoji")
    )
    # Who is at a table right now, so the row can say so — a watch list that
    # cannot tell you somebody is playing is only half of one.
    playing = set(
        TournamentPlayer.objects
        .filter(user__in=watched_users, is_eliminated=False)
        .filter(Q(tournament__status="running") | Q(tournament__status="paused"))
        .values_list("user_id", flat=True)
    )

    return Response([
        {
            "username": user.username,
            "avatar_emoji": profiles.get(user.id) or "\U0001F0CF",
            "playing_now": user.id in playing,
        }
        for user in watched_users
    ])


@api_view(["DELETE"])
@permission_classes([permissions.IsAuthenticated])
def unwatch(request, username):
    request.user.watching.filter(watched__username__iexact=username).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
