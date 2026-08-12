from rest_framework import serializers

from .models import Hand, HandAction


class HandActionSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="player.user.username", read_only=True)
    seat = serializers.IntegerField(source="player.seat_at_table", read_only=True)

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
