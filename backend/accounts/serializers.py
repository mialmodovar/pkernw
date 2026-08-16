from django.contrib.auth.models import User
from rest_framework import serializers

from game.giphy import GIF_ID_PATTERN, clean_gif_id

from .avatars import avatar_url
from .models import AvatarImage, Profile
from .naming import DISPLAY_NAME_MAX, shown_name

AVAILABLE_AVATARS = [
    "🃏", "♠️", "♣️", "♥️", "♦️", "🎲", "🏆", "💰",
    "🔥", "😎", "🤖", "🐸", "🦈", "🐍", "🦁", "🐺",
    "🎩", "🕶️", "💎", "🍀", "🚀", "👑", "🥷", "🦊",
]

# Kept in step with PRESETS in frontend/src/theme/themes.js. The actual colours
# live there; this is only the guest list, so a stale or hand-crafted request
# cannot park an unknown preset name in the profile.
AVAILABLE_THEME_PRESETS = ["burgundy", "midnight", "slate"]

# Likewise PATTERNS in frontend/src/theme/themes.js.
AVAILABLE_CARD_PATTERNS = ["weave", "crosshatch", "pinstripe", "grid", "gradient", "solid"]

HEX_COLOUR = r"^#[0-9a-fA-F]{6}$"


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ("id", "username", "password")

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class ProfileSerializer(serializers.ModelSerializer):
    # An uploaded picture wins over the emoji when there is one, but the emoji
    # is still sent: it is what the client falls back to if the image fails to
    # load, and what comes back if the picture is removed.
    avatar_url = serializers.SerializerMethodField()

    # What other players read. Sent already resolved — the username where no
    # display name is set — so no client has to know the fallback rule.
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = ("avatar_emoji", "avatar_url", "display_name", "theme")

    def get_display_name(self, profile):
        return shown_name(profile.user.username, profile.display_name)

    def get_avatar_url(self, profile):
        # values_list, so reading a profile never drags the image bytes along.
        stamp = (
            AvatarImage.objects.filter(user_id=profile.user_id)
            .values_list("updated_at", flat=True)
            .first()
        )
        return avatar_url(profile.user_id, stamp)


class UserSerializer(serializers.ModelSerializer):
    profile = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "profile", "is_staff", "is_superuser")

    def get_profile(self, user):
        profile, _ = Profile.objects.get_or_create(user=user)
        return ProfileSerializer(profile).data


class AvatarUpdateSerializer(serializers.Serializer):
    avatar_emoji = serializers.ChoiceField(choices=AVAILABLE_AVATARS)


class DisplayNameSerializer(serializers.Serializer):
    """The name a player puts in front of everybody else.

    Blank is allowed and means "go back to my username" — a display name is
    something you can put down as well as pick up.
    """

    display_name = serializers.CharField(
        max_length=DISPLAY_NAME_MAX, allow_blank=True, trim_whitespace=True,
    )

    def validate_display_name(self, value):
        name = " ".join(value.split())
        if not name:
            return ""
        # Nothing that could be read as somebody else at a table where money
        # changes hands: not another player's login, and not a display name
        # already taken. Case-insensitive, because "Rui" and "rui" are the same
        # person to everyone reading the felt.
        me = self.context["user"]
        if User.objects.filter(username__iexact=name).exclude(pk=me.pk).exists():
            raise serializers.ValidationError("Somebody already plays under that name.")
        taken = (
            Profile.objects
            .filter(display_name__iexact=name)
            .exclude(user_id=me.pk)
            .exists()
        )
        if taken:
            raise serializers.ValidationError("Somebody already plays under that name.")
        return name


class ThemeUpdateSerializer(serializers.Serializer):
    """A whole theme at once — the client always sends every field, and the
    stored blob is replaced rather than merged, so clearing the accent is just
    sending it as null."""

    preset = serializers.ChoiceField(choices=AVAILABLE_THEME_PRESETS, default="burgundy")
    accent = serializers.RegexField(HEX_COLOUR, allow_null=True, default=None)
    pattern = serializers.ChoiceField(choices=AVAILABLE_CARD_PATTERNS, default="weave")
    # The GIF that plays in the middle of the table when this player knocks
    # somebody out. Stored as a Giphy id, never a URL — see game/giphy.py for
    # why that distinction is the whole security of the feature.
    finisher_gif_id = serializers.RegexField(
        GIF_ID_PATTERN.pattern, allow_null=True, allow_blank=True, default=None,
    )

    def validate_finisher_gif_id(self, value):
        # An empty string is how the client says "no finisher", and it should
        # land in the profile as a null rather than as a blank to test for.
        return clean_gif_id(value)
