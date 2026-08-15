from rest_framework import serializers
from django.utils import timezone

from game.consumers import late_registration_open as _late_registration_open

from .bounties import BountyConfig, starting_bounty_cents
from .models import Tournament, TournamentTable, BlindLevel, TournamentPlayer


def _normalize_level_payload(level_data):
    level = dict(level_data)
    is_break = level.get("is_break", False)

    if is_break:
        level["small_blind"] = 0
        level["big_blind"] = 0
        level["ante"] = 0
        level["duration_hands"] = None
        return level

    if level.get("duration_minutes"):
        level["duration_hands"] = None
    else:
        level["duration_minutes"] = None
    return level


def _normalize_payout_structure(payout_structure):
    normalized = []
    seen_places = set()
    total_percentage = 0

    if payout_structure in (None, ""):
        return normalized
    if not isinstance(payout_structure, list):
        raise serializers.ValidationError({"payout_structure": "Payout structure must be a list."})

    for index, row in enumerate(payout_structure, 1):
        if not isinstance(row, dict):
            raise serializers.ValidationError({"payout_structure": f"Payout row {index} must be an object."})
        try:
            place = int(row.get("place"))
            percentage = float(row.get("percentage"))
        except (TypeError, ValueError):
            raise serializers.ValidationError({"payout_structure": f"Payout row {index} needs a place and percentage."})

        if place <= 0:
            raise serializers.ValidationError({"payout_structure": "Payout places must be positive."})
        if place in seen_places:
            raise serializers.ValidationError({"payout_structure": "Payout places cannot be duplicated."})
        if percentage <= 0 or percentage > 100:
            raise serializers.ValidationError({"payout_structure": "Payout percentages must be between 0 and 100."})

        seen_places.add(place)
        total_percentage += percentage
        normalized.append(
            {
                "place": place,
                "label": str(row.get("label") or f"{place}").strip()[:50],
                "percentage": round(percentage, 2),
            }
        )

    if normalized and round(total_percentage, 2) != 100:
        raise serializers.ValidationError({"payout_structure": "Payout percentages must add up to 100."})

    return sorted(normalized, key=lambda item: item["place"])


class BlindLevelSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlindLevel
        fields = (
            "id",
            "level_number",
            "is_break",
            "small_blind",
            "big_blind",
            "ante",
            "duration_hands",
            "duration_minutes",
        )
        extra_kwargs = {
            "level_number":     {"required": False},
            "is_break":         {"required": False},
            "duration_hands":   {"required": False},
            "duration_minutes": {"required": False},
        }

    def validate(self, attrs):
        is_break = attrs.get("is_break", False)
        duration_hands = attrs.get("duration_hands")
        duration_minutes = attrs.get("duration_minutes")
        small_blind = attrs.get("small_blind", 0)
        big_blind = attrs.get("big_blind", 0)
        ante = attrs.get("ante", 0)

        if is_break:
            if duration_minutes is None or duration_minutes <= 0:
                raise serializers.ValidationError({"duration_minutes": "Break levels require a positive minute duration."})
            if duration_hands not in (None, 0):
                raise serializers.ValidationError({"duration_hands": "Break levels cannot be hand-based."})
            if any(value not in (None, 0) for value in (small_blind, big_blind, ante)):
                raise serializers.ValidationError("Break levels cannot define blinds or antes.")
            return attrs

        if small_blind <= 0 or big_blind <= 0:
            raise serializers.ValidationError("Blind levels require positive small and big blinds.")
        if big_blind < small_blind:
            raise serializers.ValidationError({"big_blind": "Big blind must be greater than or equal to small blind."})

        has_hands = duration_hands is not None
        has_minutes = duration_minutes is not None
        if has_hands == has_minutes:
            raise serializers.ValidationError("Blind levels must use either hands or minutes, but not both.")
        if has_hands and duration_hands <= 0:
            raise serializers.ValidationError({"duration_hands": "Duration must be positive."})
        if has_minutes and duration_minutes <= 0:
            raise serializers.ValidationError({"duration_minutes": "Duration must be positive."})
        return attrs


class TournamentPlayerSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    prize_cents = serializers.SerializerMethodField()
    bounty_prize_cents = serializers.SerializerMethodField()
    table_id = serializers.IntegerField(source="table.id", read_only=True)
    table_number = serializers.IntegerField(source="table.table_number", read_only=True)

    class Meta:
        model = TournamentPlayer
        fields = (
            "id",
            "username",
            "table_id",
            "table_number",
            "seat",
            "seat_at_table",
            "chips",
            "finish_position",
            "is_eliminated",
            "rebuy_count",
            "time_bank_seconds_remaining",
            "bounty_cents",
            "bounty_won_cents",
            "knockouts",
            "prize_cents",
            "bounty_prize_cents",
        )

    def get_prize_cents(self, player):
        """What this player took home, once the tournament settled.

        Read from the map the parent serializer builds, so a full table costs
        one query rather than one per seat.
        """
        return self.context.get("prizes_by_user", {}).get(player.user_id, (0, 0))[0]

    def get_bounty_prize_cents(self, player):
        """The knockout half of that prize, once settled.

        Before settlement the live `bounty_won_cents` on the row is the honest
        answer and the clients fall back to it — this only ever reports what the
        ledger actually recorded.
        """
        return self.context.get("prizes_by_user", {}).get(player.user_id, (0, 0))[1]


class TournamentTableSerializer(serializers.ModelSerializer):
    player_count = serializers.IntegerField(source="players.count", read_only=True)

    class Meta:
        model = TournamentTable
        fields = ("id", "table_number", "max_seats", "is_active", "player_count")


class TournamentListSerializer(serializers.ModelSerializer):
    host_name    = serializers.CharField(source="host.username", read_only=True)
    player_count = serializers.IntegerField(source="players.count", read_only=True)
    table_count  = serializers.IntegerField(source="tables.count", read_only=True)
    is_joined    = serializers.SerializerMethodField()
    is_host      = serializers.SerializerMethodField()
    winner_name  = serializers.SerializerMethodField()
    my_finish_position = serializers.SerializerMethodField()
    late_registration_open = serializers.SerializerMethodField()

    def _my_seat(self, tournament):
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return None
        return tournament.players.filter(user=request.user).first()

    def get_is_joined(self, tournament):
        return self._my_seat(tournament) is not None

    def get_is_host(self, tournament):
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return False
        return tournament.host_id == request.user.id

    def get_late_registration_open(self, tournament):
        return _late_registration_open(tournament)

    def get_winner_name(self, tournament):
        winner = tournament.players.filter(finish_position=1).select_related("user").first()
        return winner.user.username if winner else None

    def get_my_finish_position(self, tournament):
        seat = self._my_seat(tournament)
        return seat.finish_position if seat else None

    class Meta:
        model = Tournament
        fields = ("id", "name", "host_name", "status", "starting_chips", "buy_in_cents", "is_joined",
                  "is_host",
                  "winner_name", "my_finish_position",
                  "max_players", "players_per_table", "player_count", "table_count", "late_reg_level",
                  "late_registration_open",
                  "allow_rebuys", "max_rebuys", "rebuy_level", "scheduled_start_at",
                  "time_bank_seconds", "time_bank_refill_rule", "time_bank_refill_every_hands",
                  "time_bank_refill_level", "payout_structure", "rabbit_hunting_enabled",
                  "bounty_mode", "bounty_cents", "bounty_progressive_split_pct",
                  "auto_remove_offline_seconds", "created_at")


class TournamentDetailSerializer(serializers.ModelSerializer):
    host_name = serializers.CharField(source="host.username", read_only=True)
    players   = serializers.SerializerMethodField()
    tables    = TournamentTableSerializer(many=True, read_only=True)
    levels    = BlindLevelSerializer(many=True, read_only=True)

    class Meta:
        model = Tournament
        fields = ("id", "name", "host_name", "status", "starting_chips", "buy_in_cents",
                  "max_players", "players_per_table", "players", "tables", "levels",
                  "late_reg_level", "allow_rebuys", "max_rebuys", "rebuy_level",
                  "scheduled_start_at", "time_bank_seconds", "time_bank_refill_rule",
                  "time_bank_refill_every_hands", "time_bank_refill_level",
                  "payout_structure", "rabbit_hunting_enabled", "auto_remove_offline_seconds",
                  "bounty_mode", "bounty_cents", "bounty_progressive_split_pct",
                  "created_at")

    def get_players(self, tournament):
        from .models import LedgerEntry

        prizes = {
            user_id: (prize_cents, bounty_cents)
            for user_id, prize_cents, bounty_cents in LedgerEntry.objects
            .filter(tournament=tournament)
            .values_list("user_id", "prize_cents", "bounty_prize_cents")
        }
        return TournamentPlayerSerializer(
            tournament.players.all(), many=True,
            context={**self.context, "prizes_by_user": prizes},
        ).data


class TournamentCreateSerializer(serializers.ModelSerializer):
    levels = BlindLevelSerializer(many=True, required=False)

    class Meta:
        model = Tournament
        fields = ("id", "name", "starting_chips", "buy_in_cents", "max_players", "players_per_table",
                  "late_reg_level", "allow_rebuys", "max_rebuys", "rebuy_level",
                  "scheduled_start_at", "time_bank_seconds", "time_bank_refill_rule",
                  "time_bank_refill_every_hands", "time_bank_refill_level",
                  "payout_structure", "rabbit_hunting_enabled", "auto_remove_offline_seconds",
                  "bounty_mode", "bounty_cents", "bounty_progressive_split_pct",
                  "levels")

    def validate(self, attrs):
        max_players = attrs.get("max_players", getattr(self.instance, "max_players", 9))
        players_per_table = attrs.get("players_per_table", getattr(self.instance, "players_per_table", 9))
        allow_rebuys = attrs.get("allow_rebuys", getattr(self.instance, "allow_rebuys", True))
        max_rebuys = attrs.get("max_rebuys", getattr(self.instance, "max_rebuys", 2))
        late_reg_level = attrs.get("late_reg_level", getattr(self.instance, "late_reg_level", 4))
        rebuy_level = attrs.get("rebuy_level", getattr(self.instance, "rebuy_level", 4))
        scheduled_start_at = attrs.get("scheduled_start_at")
        time_bank_seconds = attrs.get("time_bank_seconds", getattr(self.instance, "time_bank_seconds", 0))
        time_bank_refill_rule = attrs.get("time_bank_refill_rule", getattr(self.instance, "time_bank_refill_rule", "none"))
        time_bank_refill_every_hands = attrs.get("time_bank_refill_every_hands")
        time_bank_refill_level = attrs.get("time_bank_refill_level")
        payout_structure = attrs.get("payout_structure", [])
        bounty_mode = attrs.get("bounty_mode", getattr(self.instance, "bounty_mode", "none"))
        bounty_cents = attrs.get("bounty_cents", getattr(self.instance, "bounty_cents", 0))
        bounty_split = attrs.get(
            "bounty_progressive_split_pct",
            getattr(self.instance, "bounty_progressive_split_pct", 50),
        )
        buy_in_cents = attrs.get("buy_in_cents", getattr(self.instance, "buy_in_cents", 0))
        auto_remove_offline_seconds = attrs.get(
            "auto_remove_offline_seconds",
            getattr(self.instance, "auto_remove_offline_seconds", 0),
        )
        levels = attrs.get("levels")

        if max_players < 2:
            raise serializers.ValidationError({"max_players": "Tournament capacity must be at least 2 players."})
        if players_per_table < 2 or players_per_table > 9:
            raise serializers.ValidationError({"players_per_table": "Players per table must be between 2 and 9."})
        if max_players < players_per_table:
            raise serializers.ValidationError({"max_players": "Total player cap must be greater than or equal to players per table."})
        if late_reg_level < 0:
            raise serializers.ValidationError({"late_reg_level": "Late registration cutoff cannot be negative."})
        if max_rebuys < 0:
            raise serializers.ValidationError({"max_rebuys": "Max rebuys cannot be negative."})
        if rebuy_level < 0:
            raise serializers.ValidationError({"rebuy_level": "Rebuy cutoff cannot be negative."})
        if not allow_rebuys and max_rebuys:
            attrs["max_rebuys"] = 0
        if scheduled_start_at is not None and scheduled_start_at <= timezone.now():
            raise serializers.ValidationError({"scheduled_start_at": "Scheduled start must be in the future."})
        if time_bank_seconds < 0:
            raise serializers.ValidationError({"time_bank_seconds": "Time bank length cannot be negative."})
        if auto_remove_offline_seconds < 0:
            raise serializers.ValidationError({"auto_remove_offline_seconds": "Offline removal timeout cannot be negative."})
        if time_bank_refill_rule not in {"none", "hands", "blind_level"}:
            raise serializers.ValidationError({"time_bank_refill_rule": "Choose a valid time bank refill rule."})
        if time_bank_seconds == 0:
            attrs["time_bank_refill_rule"] = "none"
            attrs["time_bank_refill_every_hands"] = None
            attrs["time_bank_refill_level"] = None
        elif time_bank_refill_rule == "hands":
            if time_bank_refill_every_hands is None or time_bank_refill_every_hands <= 0:
                raise serializers.ValidationError({"time_bank_refill_every_hands": "Enter a positive hand interval."})
            attrs["time_bank_refill_level"] = None
        elif time_bank_refill_rule == "blind_level":
            if time_bank_refill_level is None or time_bank_refill_level <= 0:
                raise serializers.ValidationError({"time_bank_refill_level": "Enter a positive blind level."})
            attrs["time_bank_refill_every_hands"] = None
        else:
            attrs["time_bank_refill_every_hands"] = None
            attrs["time_bank_refill_level"] = None
        attrs["payout_structure"] = _normalize_payout_structure(payout_structure)

        if bounty_mode not in {"none", "fixed", "progressive"}:
            raise serializers.ValidationError({"bounty_mode": "Choose a valid knockout mode."})
        if bounty_mode == "none":
            attrs["bounty_cents"] = 0
        else:
            if buy_in_cents <= 0:
                raise serializers.ValidationError(
                    {"bounty_mode": "Knockout bounties need a buy-in to come out of."}
                )
            if bounty_cents <= 0:
                raise serializers.ValidationError({"bounty_cents": "Enter a positive bounty."})
            # The bounty is part of the buy-in, not an extra charge on top of
            # it. Taking the whole buy-in would leave nothing to place for.
            if bounty_cents >= buy_in_cents:
                raise serializers.ValidationError(
                    {"bounty_cents": "The bounty comes out of the buy-in, so it must be less than it."}
                )
        if bounty_mode == "progressive":
            if not 1 <= bounty_split <= 99:
                raise serializers.ValidationError(
                    {"bounty_progressive_split_pct": "The cash share must be between 1 and 99 percent."}
                )
        else:
            attrs["bounty_progressive_split_pct"] = 50

        if levels:
            blind_level_count = sum(1 for level in levels if not level.get("is_break", False))
            if blind_level_count == 0:
                raise serializers.ValidationError({"levels": "At least one playable blind level is required."})
            if late_reg_level > blind_level_count:
                raise serializers.ValidationError({"late_reg_level": "Late registration cutoff cannot exceed the number of blind levels."})
            if rebuy_level > blind_level_count:
                raise serializers.ValidationError({"rebuy_level": "Rebuy cutoff cannot exceed the number of blind levels."})
            if time_bank_refill_rule == "blind_level" and time_bank_refill_level > blind_level_count:
                raise serializers.ValidationError({"time_bank_refill_level": "Time bank refill level cannot exceed the number of blind levels."})

        return attrs

    def create(self, validated_data):
        levels_data = validated_data.pop("levels", None)
        tournament = Tournament.objects.create(host=self.context["request"].user, **validated_data)
        primary_table = tournament.ensure_table(1)

        if levels_data:
            for i, lvl in enumerate(levels_data):
                normalized = _normalize_level_payload(lvl)
                normalized["level_number"] = i + 1
                normalized.pop("id", None)
                BlindLevel.objects.create(tournament=tournament, **normalized)
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
                    is_break=False, small_blind=sb, big_blind=bb, ante=ante, duration_hands=dur,
                )

        # Auto-join host at seat 0
        TournamentPlayer.objects.create(
            tournament=tournament, user=tournament.host,
            table=primary_table, seat=0, seat_at_table=0, chips=tournament.starting_chips,
            time_bank_seconds_remaining=tournament.time_bank_seconds,
            bounty_cents=starting_bounty_cents(BountyConfig.from_tournament(tournament)),
        )
        return tournament
