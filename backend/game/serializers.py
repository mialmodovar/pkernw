from rest_framework import serializers

from .models import Hand, HandAction


class HandActionSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="player.user.username", read_only=True)
    seat = serializers.SerializerMethodField()

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
        fields = ("username", "seat", "street", "action", "amount")


class HandSerializer(serializers.ModelSerializer):
    actions = HandActionSerializer(many=True, read_only=True)

    class Meta:
        model = Hand
        fields = (
            "id", "hand_number", "level_index", "dealer_seat",
            "community_cards", "pot_total", "result", "started_at", "actions",
        )
