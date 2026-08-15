from django.contrib.auth.models import User
from rest_framework import serializers

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
    """A whole theme at once — the client always sends both fields, and the
    stored blob is replaced rather than merged, so clearing the accent is just
    sending it as null."""

    preset = serializers.ChoiceField(choices=AVAILABLE_THEME_PRESETS, default="burgundy")
    accent = serializers.RegexField(HEX_COLOUR, allow_null=True, default=None)
    pattern = serializers.ChoiceField(choices=AVAILABLE_CARD_PATTERNS, default="weave")
