from rest_framework import serializers

from accounts.avatars import avatar_url
from accounts.naming import shown_name

from .models import Club, League, Membership, Season
from .permissions import role_in
from .scoring import normalize_scheme


def _normalize_prizes(prizes):
    """What the club says it will pay. Declared only — the app never records
    anybody owing it, so this is checked for shape and nothing more."""
    if not isinstance(prizes, list):
        return []
    rows = []
    for index, row in enumerate(prizes[:20], 1):
        if not isinstance(row, dict):
            continue
        try:
            place = int(row.get("place", index))
            amount = int(row.get("amount_cents", 0))
        except (TypeError, ValueError):
            continue
        rows.append({
            "place": max(1, place),
            "label": str(row.get("label") or f"{place}").strip()[:40],
            "amount_cents": max(0, amount),
        })
    return sorted(rows, key=lambda row: row["place"])


class MemberSerializer(serializers.ModelSerializer):
    """A member's face and the name they go by, the same way every other list
    of players in the app reports them — see accounts/watching.py."""

    username = serializers.CharField(source="user.username", read_only=True)
    display_name = serializers.SerializerMethodField()
    avatar_emoji = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = Membership
        fields = ("username", "display_name", "avatar_emoji", "avatar_url", "role", "joined_at")

    def _profile(self, membership):
        return getattr(membership.user, "profile", None)

    def get_display_name(self, membership):
        profile = self._profile(membership)
        return shown_name(membership.user.username, getattr(profile, "display_name", ""))

    def get_avatar_emoji(self, membership):
        return getattr(self._profile(membership), "avatar_emoji", None) or "\U0001F0CF"

    def get_avatar_url(self, membership):
        image = getattr(membership.user, "avatar_image", None)
        return avatar_url(membership.user_id, getattr(image, "updated_at", None))


class SeasonSerializer(serializers.ModelSerializer):
    is_open = serializers.BooleanField(read_only=True)

    class Meta:
        model = Season
        fields = ("id", "name", "starts_on", "ends_on", "closed_at", "is_open", "scoring", "prizes")

    def validate_scoring(self, value):
        return normalize_scheme(value)

    def validate_prizes(self, value):
        return _normalize_prizes(value)


class LeagueSerializer(serializers.ModelSerializer):
    seasons = SeasonSerializer(many=True, read_only=True)
    open_season_id = serializers.SerializerMethodField()

    class Meta:
        model = League
        fields = ("id", "name", "emoji", "description", "is_archived", "seasons", "open_season_id")

    def get_open_season_id(self, league):
        season = league.open_season
        return season.id if season else None


class ClubListSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    my_role = serializers.SerializerMethodField()
    league_count = serializers.SerializerMethodField()

    class Meta:
        model = Club
        fields = ("id", "name", "slug", "emoji", "description", "is_public",
                  "member_count", "league_count", "my_role", "created_at")

    def get_member_count(self, club):
        return club.memberships.count()

    def get_league_count(self, club):
        return club.leagues.filter(is_archived=False).count()

    def get_my_role(self, club):
        request = self.context.get("request")
        return role_in(request.user, club) if request else None


class ClubDetailSerializer(ClubListSerializer):
    members = MemberSerializer(source="memberships", many=True, read_only=True)
    leagues = LeagueSerializer(many=True, read_only=True)
    # Only ever sent to somebody who can invite with it — see the view.
    invite_code = serializers.SerializerMethodField()

    class Meta(ClubListSerializer.Meta):
        fields = ClubListSerializer.Meta.fields + ("members", "leagues", "invite_code")

    def get_invite_code(self, club):
        request = self.context.get("request")
        if request and role_in(request.user, club) is not None:
            return club.invite_code
        # A code handed to somebody outside the club would make every private
        # club public to anybody who could see it existed.
        return None


class ClubWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Club
        fields = ("name", "emoji", "description", "is_public")

    def validate_name(self, value):
        name = value.strip()
        if len(name) < 2:
            raise serializers.ValidationError("Give the club a name.")
        return name
