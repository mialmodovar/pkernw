from rest_framework import serializers
from .models import Tournament, BlindLevel, TournamentPlayer


class BlindLevelSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlindLevel
        fields = ("id", "level_number", "small_blind", "big_blind", "ante", "duration_hands", "duration_minutes")
        extra_kwargs = {
            "level_number":     {"required": False},
            "duration_hands":   {"required": False},
            "duration_minutes": {"required": False},
        }


class TournamentPlayerSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = TournamentPlayer
        fields = ("id", "username", "seat", "chips", "finish_position", "is_eliminated", "rebuy_count")


class TournamentListSerializer(serializers.ModelSerializer):
    host_name    = serializers.CharField(source="host.username", read_only=True)
    player_count = serializers.IntegerField(source="players.count", read_only=True)

    class Meta:
        model = Tournament
        fields = ("id", "name", "host_name", "status", "starting_chips",
                  "max_players", "player_count", "late_reg_level", "created_at")


class TournamentDetailSerializer(serializers.ModelSerializer):
    host_name = serializers.CharField(source="host.username", read_only=True)
    players   = TournamentPlayerSerializer(many=True, read_only=True)
    levels    = BlindLevelSerializer(many=True, read_only=True)

    class Meta:
        model = Tournament
        fields = ("id", "name", "host_name", "status", "starting_chips",
                  "max_players", "players", "levels",
                  "late_reg_level", "allow_rebuys", "max_rebuys", "rebuy_level",
                  "created_at")


class TournamentCreateSerializer(serializers.ModelSerializer):
    levels = BlindLevelSerializer(many=True, required=False)

    class Meta:
        model = Tournament
        fields = ("id", "name", "starting_chips", "max_players",
                  "late_reg_level", "allow_rebuys", "max_rebuys", "rebuy_level",
                  "levels")

    def create(self, validated_data):
        levels_data = validated_data.pop("levels", None)
        tournament = Tournament.objects.create(host=self.context["request"].user, **validated_data)

        if levels_data:
            for i, lvl in enumerate(levels_data):
                lvl["level_number"] = i + 1
                lvl.pop("id", None)
                # If time-based, clear duration_hands and vice versa
                if lvl.get("duration_minutes"):
                    lvl["duration_hands"] = None
                else:
                    lvl.pop("duration_minutes", None)
                BlindLevel.objects.create(tournament=tournament, **lvl)
        else:
            # Provide a sensible default blind structure
            defaults = [
                (25,   50,    0,  8), (50,   100,   10, 8),
                (75,   150,   25, 8), (100,  200,   25, 8),
                (150,  300,   50, 6), (200,  400,   50, 6),
                (300,  600,   75, 6), (400,  800,  100, 6),
                (500,  1000, 100, 6), (750,  1500, 200, 4),
                (1000, 2000, 300, 4), (1500, 3000, 500, 4),
            ]
            for i, (sb, bb, ante, dur) in enumerate(defaults, 1):
                BlindLevel.objects.create(
                    tournament=tournament, level_number=i,
                    small_blind=sb, big_blind=bb, ante=ante, duration_hands=dur,
                )

        # Auto-join host at seat 0
        TournamentPlayer.objects.create(
            tournament=tournament, user=tournament.host,
            seat=0, chips=tournament.starting_chips,
        )
        return tournament
