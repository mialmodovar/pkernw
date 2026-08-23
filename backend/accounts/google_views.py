"""The two ways a Google account meets an account here.

Signing in, which is anybody; and connecting, which is somebody already signed
in attaching Google to the account they already have. The second is why this
file exists at all — see googleauth.py — because there is no email on the old
accounts to match a Google address against, and the only safe way to say "these
two are the same person" is for the person to say it from inside both.
"""

from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from . import googleauth, recovery
from .models import Profile


def _tokens(user):
    """The same pair the ordinary login hands out, so nothing downstream has to
    know which door somebody came through."""
    refresh = RefreshToken.for_user(user)
    return {"refresh": str(refresh), "access": str(refresh.access_token)}


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def google_config(request):
    """Which Google client the browser should ask for a token, if any.

    Asked rather than built in, so there is one copy of this setting and not a
    second one baked into the bundle to fall out of step with it. An empty
    answer is a complete answer: it means the button is not drawn.
    """
    return Response({"client_id": googleauth.client_id()})


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def google_sign_in(request):
    """Sign in with Google, making the account if this is the first time.

    A new account gets a recovery code like any other, handed back exactly once
    here — it is the way back in if the Google account is ever lost, and this is
    the only moment anybody can read it.
    """
    claims = googleauth.verify(request.data.get("credential"))
    if isinstance(claims, str):
        return Response({"error": claims}, status=status.HTTP_400_BAD_REQUEST)

    profile = Profile.objects.filter(google_sub=claims["sub"]).select_related("user").first()
    if profile is not None:
        # The email is refreshed on the way through: people rename their Google
        # accounts, and the only thing this is used for is showing them which
        # one is connected.
        if profile.google_email != claims["email"]:
            Profile.objects.filter(pk=profile.pk).update(google_email=claims["email"])
        return Response({**_tokens(profile.user), "created": False})

    code = recovery.new_code()
    with transaction.atomic():
        taken = set(User.objects.values_list("username", flat=True))
        user = User.objects.create_user(
            username=googleauth.username_for(claims["email"], claims["name"], taken),
            email=claims["email"],
        )
        # No password at all, rather than a random one nobody knows: this
        # account is entered through Google or through its recovery code, and
        # an unusable password is how Django says exactly that.
        user.set_unusable_password()
        user.save(update_fields=["password"])
        Profile.objects.update_or_create(
            user=user,
            defaults={
                "display_name": googleauth.display_name_for(claims["name"], claims["email"]),
                "google_sub": claims["sub"],
                "google_email": claims["email"],
                "recovery_code_hash": recovery.hash_code(code),
            },
        )

    return Response(
        {**_tokens(user), "created": True, "username": user.username, "recovery_code": code},
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST", "DELETE"])
@permission_classes([permissions.IsAuthenticated])
def google_link(request):
    """Connect a Google account to this one, or disconnect it.

    Connecting is the whole point of the pair: an account made the old way, with
    a username and a password and a code on a bit of paper, can be handed a
    second way in without an email ever being sent.

    Disconnecting is refused for anybody who has no password, because the only
    thing holding their account open would be a recovery code they have already
    proved once they might lose. They can set a password with that code — see
    recover_password — and then disconnect.
    """
    profile, _made = Profile.objects.get_or_create(user=request.user)

    if request.method == "DELETE":
        if not profile.google_sub:
            return Response({"error": "No Google account is connected."},
                            status=status.HTTP_400_BAD_REQUEST)
        if not request.user.has_usable_password():
            return Response(
                {"error": "Set a password first, or this would be the way you lock yourself out."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        profile.google_sub = ""
        profile.google_email = ""
        profile.save(update_fields=["google_sub", "google_email"])
        return Response({"connected": False, "google_email": ""})

    claims = googleauth.verify(request.data.get("credential"))
    if isinstance(claims, str):
        return Response({"error": claims}, status=status.HTTP_400_BAD_REQUEST)

    if profile.google_sub and profile.google_sub != claims["sub"]:
        return Response(
            {"error": "This account is already connected to a different Google account."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    profile.google_sub = claims["sub"]
    profile.google_email = claims["email"]
    try:
        with transaction.atomic():
            profile.save(update_fields=["google_sub", "google_email"])
    except IntegrityError:
        # The unique constraint doing its job: that Google account is already
        # somebody's way in here, and it cannot be two people's.
        return Response(
            {"error": "That Google account is already connected to another player."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response({"connected": True, "google_email": profile.google_email})
