from rest_framework import serializers

from accounts.naming import shown_name

from .models import Hand, HandAction


class HandActionSerializer(serializers.ModelSerializer):
    # The login name, which nothing prints — it is what a row is filed under.
    username = serializers.CharField(source="player.user.username", read_only=True)
    # What they are called in front of everybody else, which is what the replay
    # should say. Somebody who has set a display name has said what they want to
    # be called, and a hand history calling them by their login name is the app
    # ignoring that at the one moment their play is being talked about.
    display_name = serializers.SerializerMethodField()
    seat = serializers.SerializerMethodField()

    def get_display_name(self, action):
        user = action.player.user
        return shown_name(user.username, getattr(getattr(user, "profile", None), "display_name", ""))

    def get_seat(self, action):
        """The seat this action was made from.

        Not the player's seat_at_table, which is where they are sitting *now* —
        that moves when tables rebalance, so a replay built on it put a player
        in a seat they only reached two hands later, and matched them to
        somebody else's showdown. The hand records its own seats; the fallback
        is only for rows written before it did.
        """
        return action.seat if action.seat is not None else action.player.seat_at_table

    class Meta:
        model = HandAction
        fields = ("username", "display_name", "seat", "street", "action", "amount")


class HandSerializer(serializers.ModelSerializer):
    actions = HandActionSerializer(many=True, read_only=True)

    class Meta:
        model = Hand
        fields = (
            "id", "hand_number", "level_index", "dealer_seat",
            "community_cards", "pot_total", "result", "started_at", "actions",
        )
