"""Balances and settling up."""

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .ledger import balances, owed_between, suggested_transfers
from .models import LedgerEntry, Settlement

User = get_user_model()


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def my_ledger(request):
    """Your balance, the debts you are part of, and what produced them.

    Only what involves you: this is money between people.
    """
    me = request.user.id
    current = balances()
    transfers = suggested_transfers(current)

    names = dict(User.objects.filter(
        id__in={t["from_user_id"] for t in transfers} | {t["to_user_id"] for t in transfers}
    ).values_list("id", "username"))

    history = [
        {
            "tournament_id": entry.tournament_id,
            "tournament": entry.tournament.name,
            "stake_cents": entry.stake_cents,
            "prize_cents": entry.prize_cents,
            "net_cents": entry.net_cents,
        }
        for entry in LedgerEntry.objects.filter(user=request.user)
        .select_related("tournament").order_by("-created_at")[:25]
    ]

    return Response({
        "balance_cents": current.get(me, 0),
        "owed_to_me": [
            {"username": names.get(t["from_user_id"]), "amount_cents": t["amount_cents"]}
            for t in transfers if t["to_user_id"] == me
        ],
        "i_owe": [
            {"username": names.get(t["to_user_id"]), "amount_cents": t["amount_cents"]}
            for t in transfers if t["from_user_id"] == me
        ],
        "history": history,
    })


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def record_settlement(request):
    """Mark money as received. The caller is always the one who received it.

    Only the receiver can close a debt — a payer marking themselves paid is
    exactly the claim the other side would want to dispute.
    """
    username = request.data.get("from_username")
    try:
        amount_cents = round(float(request.data.get("amount_eur", 0)) * 100)
    except (TypeError, ValueError):
        return Response({"error": "Invalid amount"}, status=status.HTTP_400_BAD_REQUEST)

    if amount_cents <= 0:
        return Response({"error": "Amount must be positive"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        payer = User.objects.get(username=username)
    except User.DoesNotExist:
        return Response({"error": "No such player"}, status=status.HTTP_400_BAD_REQUEST)

    if payer.id == request.user.id:
        return Response({"error": "You cannot pay yourself"}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        owed = owed_between(payer.id, request.user.id)
        if amount_cents > owed:
            return Response(
                {"error": f"{payer.username} only owes you {owed / 100:.2f}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        Settlement.objects.create(
            from_user=payer, to_user=request.user, amount_cents=amount_cents,
        )

    return Response({"balance_cents": balances().get(request.user.id, 0)}, status=status.HTTP_201_CREATED)
