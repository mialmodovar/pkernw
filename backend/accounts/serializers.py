from django.contrib.auth.models import User
from rest_framework import serializers

from game.finishers import MAX_FINISHERS, clean_finisher
from game.giphy import GIF_ID_PATTERN, clean_gif_id

from .avatars import avatar_url
from . import recovery
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

# How the front of a card is printed. The patterns above are its back; this is
# the face, which until now every player saw the same way. "classic" is ink on
# ivory, four-colour; "inverted" fills the whole card with the suit's colour and
# prints the rank in white, which is far easier to read at a glance across a
# felt — and much easier for anybody who finds a red pip on cream hard going.
AVAILABLE_CARD_DECKS = ["classic", "inverted"]

HEX_COLOUR = r"^#[0-9a-fA-F]{6}$"


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)
    # Handed back exactly once, at the moment the account is made. Only its hash
    # is kept, so this is the only time anybody — including us — can read it.
    recovery_code = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "password", "recovery_code")

    def get_recovery_code(self, user):
        return getattr(user, "_recovery_code", "")

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        code = recovery.new_code()
        Profile.objects.update_or_create(
            user=user, defaults={"recovery_code_hash": recovery.hash_code(code)},
        )
        # Carried on the instance rather than saved: the serializer prints it
        # into this one response and it exists nowhere else afterwards.
        user._recovery_code = code
        return user


class RecoverPasswordSerializer(serializers.Serializer):
    """Setting a new password with a recovery code instead of the old one."""

    username = serializers.CharField(max_length=150)
    recovery_code = serializers.CharField(max_length=64)
    new_password = serializers.CharField(min_length=6)


class ProfileSerializer(serializers.ModelSerializer):
    # An uploaded picture wins over the emoji when there is one, but the emoji
    # is still sent: it is what the client falls back to if the image fails to
    # load, and what comes back if the picture is removed.
    avatar_url = serializers.SerializerMethodField()

    # What other players read. Sent already resolved — the username where no
    # display name is set — so no client has to know the fallback rule.
    display_name = serializers.SerializerMethodField()

    # Whether there is a way back into this account without one. Never the code
    # itself — that is readable exactly once, at the moment it is made.
    has_recovery_code = serializers.SerializerMethodField()

    # The other way back in, and whose it is. The `sub` never leaves the server:
    # what anybody needs to see is which Google account is connected, and the
    # address is the only readable part of that.
    google_email = serializers.SerializerMethodField()
    has_password = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = ("avatar_emoji", "avatar_border", "avatar_url", "display_name", "theme", "preferences",
                  "has_recovery_code", "google_email", "has_password")

    def get_has_recovery_code(self, profile):
        return bool(profile.recovery_code_hash)

    def get_google_email(self, profile):
        return profile.google_email if profile.google_sub else ""

    def get_has_password(self, profile):
        """Whether there is a password on this account at all.

        An account made through Google has none, and that decides one thing:
        whether disconnecting Google would be the same as locking yourself out.
        """
        return bool(profile.user_id and profile.user.has_usable_password())

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


class BetSizesField(serializers.ListField):
    """The raise buttons somebody wants above their slider.

    Three at most, because the row has four slots and one of them is all-in,
    and positive because a button that raises by nothing is not a button. Held
    to two decimal places: these are read off a button, not calculated with.
    """

    child = serializers.FloatField(min_value=0.1, max_value=1000)

    def __init__(self, **kwargs):
        # In the constructor rather than as a class attribute: ListField reads
        # its length limits from the arguments it was built with, and a
        # class-level max_length is quietly ignored — which is a validation rule
        # that looks present and is not.
        kwargs.setdefault("max_length", 3)
        kwargs.setdefault("allow_empty", True)
        super().__init__(**kwargs)


class PreferencesUpdateSerializer(serializers.Serializer):
    """How this player wants a table to read.

    Spelled out rather than taken as a free blob: what the client sends ends up
    in a JSON column, and a column that accepts anything is one nothing can be
    assumed about later.
    """

    # Chips or big blinds. A stack of 12,400 and a stack of 31bb are the same
    # stack, and which one a player thinks in is a habit, not a table setting.
    show_bb = serializers.BooleanField(required=False)

    # Whether the mouse gets the keyboard's two-step on a decision that puts in
    # half a stack or more. On the account rather than the browser: it is how
    # somebody plays, and the misclick it exists for costs the same on every
    # machine they sit at. See components/game/confirmAction.js for the
    # threshold.
    confirm_big_bets = serializers.BooleanField(required=False)

    # What a standard open is, in blinds, and what a standard bet is, as a share
    # of the pot. One host's idea of either has nothing to do with anybody
    # else's game, so they live on the account — see betPresets.js for which of
    # the two a given moment is priced in.
    bet_sizes_preflop = BetSizesField(required=False)
    bet_sizes_postflop = BetSizesField(required=False)


class ThemeUpdateSerializer(serializers.Serializer):
    """A whole theme at once — the client always sends every field, and the
    stored blob is replaced rather than merged, so clearing the accent is just
    sending it as null."""

    preset = serializers.ChoiceField(choices=AVAILABLE_THEME_PRESETS, default="burgundy")
    accent = serializers.RegexField(HEX_COLOUR, allow_null=True, default=None)
    pattern = serializers.ChoiceField(choices=AVAILABLE_CARD_PATTERNS, default="weave")
    # The face of the card, as against `pattern`, which is its back.
    deck = serializers.ChoiceField(choices=AVAILABLE_CARD_DECKS, default="classic")
    # What colour that back is printed in. Null means "whatever this preset
    # prints", which is what every profile saved before this said.
    card_back = serializers.RegexField(HEX_COLOUR, allow_null=True, default=None)
    # The GIF that plays in the middle of the table when this player knocks
    # somebody out. Stored as a Giphy id, never a URL — see game/giphy.py for
    # why that distinction is the whole security of the feature.
    finisher_gif_id = serializers.RegexField(
        GIF_ID_PATTERN.pattern, allow_null=True, allow_blank=True, default=None,
    )
    # The same thing, plural, and each with a sound. Kept beside the single id
    # above rather than replacing it: a client that has not been updated still
    # sends one, and a profile saved before this existed still has one.
    finishers = serializers.ListField(
        child=serializers.DictField(), required=False, default=list, max_length=MAX_FINISHERS,
    )

    def validate_finisher_gif_id(self, value):
        # An empty string is how the client says "no finisher", and it should
        # land in the profile as a null rather than as a blank to test for.
        return clean_gif_id(value)

    def validate_finishers(self, value):
        """Cleaned here rather than trusted: these are played on other people's
        screens, so an id that is not an id and a sound that is not one of ours
        are dropped rather than stored."""
        cleaned = []
        seen = set()
        for entry in value:
            finisher = clean_finisher(entry)
            if finisher and finisher["gif_id"] not in seen:
                seen.add(finisher["gif_id"])
                cleaned.append(finisher)
        return cleaned[:MAX_FINISHERS]
