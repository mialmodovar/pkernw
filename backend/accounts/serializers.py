from django.contrib.auth.models import User
from rest_framework import serializers

from game.giphy import GIF_ID_PATTERN, clean_gif_id

from .models import Profile

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
    class Meta:
        model = Profile
        fields = ("avatar_emoji", "theme")


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
