from django.contrib.auth.models import User
from rest_framework import serializers

from .models import Profile

AVAILABLE_AVATARS = [
    "🃏", "♠️", "♣️", "♥️", "♦️", "🎲", "🏆", "💰",
    "🔥", "😎", "🤖", "🐸", "🦈", "🐍", "🦁", "🐺",
    "🎩", "🕶️", "💎", "🍀", "🚀", "👑", "🥷", "🦊",
]


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
        fields = ("avatar_emoji",)


class UserSerializer(serializers.ModelSerializer):
    profile = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "profile")

    def get_profile(self, user):
        profile, _ = Profile.objects.get_or_create(user=user)
        return ProfileSerializer(profile).data


class AvatarUpdateSerializer(serializers.Serializer):
    avatar_emoji = serializers.ChoiceField(choices=AVAILABLE_AVATARS)
