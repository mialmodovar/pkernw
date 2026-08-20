from django.contrib.auth.models import User
from django.http import HttpResponse
from rest_framework import generics, permissions, status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    parser_classes,
    permission_classes,
)
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from .avatars import ACCEPTED_LABEL, AVATAR_MAX_BYTES, avatar_url, sniff_image_type
from . import recovery
from .models import AvatarImage, Profile
from .naming import shown_name
from .serializers import (
    AvatarUpdateSerializer,
    DisplayNameSerializer,
    RegisterSerializer,
    PreferencesUpdateSerializer,
    RecoverPasswordSerializer,
    ThemeUpdateSerializer,
    UserSerializer,
)


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def recover_password(request):
    """Set a new password with a recovery code.

    No email, no reset link, no waiting on a mail provider — see
    accounts/recovery.py. The code is checked the way a password is checked, and
    a wrong one is refused without saying which half was wrong: an attacker who
    can tell "no such player" from "wrong code" has been handed the guest list.

    A used code is replaced, and the new one comes back in this response. A code
    that has already got somebody in once is a password lying in a chat history.
    """
    serializer = RecoverPasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    user = User.objects.filter(username__iexact=data["username"]).first()
    profile = Profile.objects.filter(user=user).first() if user else None
    if profile is None or not recovery.code_matches(data["recovery_code"], profile.recovery_code_hash):
        return Response(
            {"error": "That username and recovery code do not match."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.set_password(data["new_password"])
    user.save(update_fields=["password"])

    code = recovery.new_code()
    profile.recovery_code_hash = recovery.hash_code(code)
    profile.save(update_fields=["recovery_code_hash"])

    return Response({"username": user.username, "recovery_code": code})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def reset_recovery_code(request):
    """A new recovery code, for somebody who has lost or shared theirs.

    Being logged in is the whole of the authority here: whoever is holding the
    session can already change the password, so they can already do everything
    a code would let them do.
    """
    code = recovery.new_code()
    profile, _ = Profile.objects.get_or_create(user=request.user)
    profile.recovery_code_hash = recovery.hash_code(code)
    profile.save(update_fields=["recovery_code_hash"])
    return Response({"recovery_code": code})


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


@api_view(["PATCH"])
@permission_classes([permissions.IsAuthenticated])
def update_avatar(request):
    serializer = AvatarUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    profile, _ = Profile.objects.get_or_create(user=request.user)
    profile.avatar_emoji = serializer.validated_data["avatar_emoji"]
    profile.save(update_fields=["avatar_emoji"])

    return Response({"avatar_emoji": profile.avatar_emoji}, status=status.HTTP_200_OK)


@api_view(["PATCH"])
@permission_classes([permissions.IsAuthenticated])
def update_display_name(request):
    """Change what other players call you.

    Only the display name moves. The username still keys the hand history, the
    ledger and every stat, so nothing already recorded changes hands.
    """
    serializer = DisplayNameSerializer(data=request.data, context={"user": request.user})
    serializer.is_valid(raise_exception=True)

    profile, _ = Profile.objects.get_or_create(user=request.user)
    profile.display_name = serializer.validated_data["display_name"]
    profile.save(update_fields=["display_name"])

    return Response(
        {"display_name": shown_name(request.user.username, profile.display_name)},
        status=status.HTTP_200_OK,
    )


@api_view(["PUT", "DELETE"])
@parser_classes([MultiPartParser])
@permission_classes([permissions.IsAuthenticated])
def avatar_image(request):
    """Upload a picture to use instead of the emoji, or drop the one there is.

    Deleting is not the same as choosing a new emoji: the emoji the player had
    is still on their profile, and removing the picture simply uncovers it.
    """
    if request.method == "DELETE":
        AvatarImage.objects.filter(user=request.user).delete()
        return Response({"avatar_url": None}, status=status.HTTP_200_OK)

    upload = request.FILES.get("image")
    if upload is None:
        return Response({"image": "No image was uploaded."}, status=status.HTTP_400_BAD_REQUEST)

    # One byte past the limit is enough to know it is over it, and stops a
    # hostile upload being read into memory in full before it is rejected.
    raw = upload.read(AVATAR_MAX_BYTES + 1)
    if len(raw) > AVATAR_MAX_BYTES:
        return Response(
            {"image": f"That image is too large — the limit is {AVATAR_MAX_BYTES // 1024} KB."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    content_type = sniff_image_type(raw)
    if content_type is None:
        return Response(
            {"image": f"That file is not a {ACCEPTED_LABEL} image."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    record, _ = AvatarImage.objects.update_or_create(
        user=request.user, defaults={"data": raw, "content_type": content_type},
    )
    return Response(
        {"avatar_url": avatar_url(request.user.id, record.updated_at)},
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def avatar_image_for_user(request, user_id):
    """The bytes behind an avatar URL.

    Open, because an <img> cannot carry a bearer token, and every one of these
    is a picture its owner chose to show the table anyway.
    """
    record = AvatarImage.objects.filter(user_id=user_id).first()
    if record is None:
        return HttpResponse(status=status.HTTP_404_NOT_FOUND)

    response = HttpResponse(bytes(record.data), content_type=record.content_type)
    # The URL carries an ?v= stamp that changes whenever the picture does, so
    # the bytes behind one can be cached for good. A request without the stamp
    # is somebody else's link, and gets a cache short enough to correct itself.
    response["Cache-Control"] = (
        "public, max-age=31536000, immutable" if request.GET.get("v") else "public, max-age=60"
    )
    # It is only ever drawn, never navigated to, and the type was sniffed from
    # the bytes rather than trusted — so pin both.
    response["X-Content-Type-Options"] = "nosniff"
    response["Content-Disposition"] = "inline"
    return response


@api_view(["PATCH"])
@permission_classes([permissions.IsAuthenticated])
def update_preferences(request):
    """How this player wants a table to read, saved to the account.

    Merged rather than replaced: the client sends the flag it just changed, and
    a preference it has not heard of — one added by a newer client on another
    device — should survive being edited from an older one.
    """
    serializer = PreferencesUpdateSerializer(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)

    profile, _ = Profile.objects.get_or_create(user=request.user)
    profile.preferences = {**(profile.preferences or {}), **serializer.validated_data}
    profile.save(update_fields=["preferences"])

    return Response(profile.preferences, status=status.HTTP_200_OK)


@api_view(["PATCH"])
@permission_classes([permissions.IsAuthenticated])
def update_theme(request):
    serializer = ThemeUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    profile, _ = Profile.objects.get_or_create(user=request.user)
    profile.theme = serializer.validated_data
    profile.save(update_fields=["theme"])

    return Response(profile.theme, status=status.HTTP_200_OK)
