"""Who owes whom, from what tournaments decided.

The app never moves money. It records what each finished tournament worked out,
keeps a running balance per player, and lets the person who received a payment
say so.

Everything is in integer cents. Money in floats drifts, and the drift here is
somebody's actual euro.
"""

from collections import defaultdict

from django.db import transaction

from .models import LedgerEntry, Settlement, Tournament


def settle_tournament(tournament):
    """Record what each player put in and took out. Safe to call twice.

    Skipped when there is no buy-in — nothing was at stake — or no payout
    structure, since a tournament that took money and never said who wins is not
    something to guess at.
    """
    if tournament.buy_in_cents <= 0:
        return False
    payouts = tournament.payout_structure or []
    if not payouts:
        return False

    with transaction.atomic():
        if LedgerEntry.objects.filter(tournament=tournament).exists():
            return False  # already settled

        players = list(tournament.players.select_related("user"))
        if not players:
            return False

        # Each rebuy is another buy-in, so the pot grows with them.
        stakes = {p.user_id: tournament.buy_in_cents * (1 + p.rebuy_count) for p in players}
        pot = sum(stakes.values())

        prizes = _prizes_for(pot, payouts, {p.user_id: p.finish_position for p in players})

        LedgerEntry.objects.bulk_create([
            LedgerEntry(
                tournament=tournament,
                user_id=user_id,
                stake_cents=stake,
                prize_cents=prizes.get(user_id, 0),
            )
            for user_id, stake in stakes.items()
        ])
    return True


def _prizes_for(pot, payouts, finish_by_user):
    """Split the pot by the payout structure, to the cent.

    Percentages are validated to total exactly 100 when the tournament is
    created, so the shares add up to the pot bar rounding. That remainder goes
    to first place rather than quietly disappearing.
    """
    by_place = {row["place"]: row["percentage"] for row in payouts}
    user_by_place = {
        finish: user_id
        for user_id, finish in finish_by_user.items()
        if finish is not None
    }

    prizes = {}
    for place, percentage in by_place.items():
        user_id = user_by_place.get(place)
        if user_id is not None:
            prizes[user_id] = int(pot * percentage / 100)

    winner = user_by_place.get(1)
    if winner is not None:
        prizes[winner] = prizes.get(winner, 0) + (pot - sum(prizes.values()))
    return prizes


def balances():
    """{user_id: cents} — positive is owed to them, negative is owed by them."""
    totals = defaultdict(int)

    for entry in LedgerEntry.objects.all().values("user_id", "stake_cents", "prize_cents"):
        totals[entry["user_id"]] += entry["prize_cents"] - entry["stake_cents"]

    # Paying settles what you owe; receiving settles what you were owed.
    for row in Settlement.objects.all().values("from_user_id", "to_user_id", "amount_cents"):
        totals[row["from_user_id"]] += row["amount_cents"]
        totals[row["to_user_id"]] -= row["amount_cents"]

    return {user_id: cents for user_id, cents in totals.items() if cents != 0}


def suggested_transfers(current=None):
    """The fewest payments that would clear everyone.

    Largest debtor pays the largest creditor until one of them is square, and
    repeat — nobody has to act as the bank.
    """
    current = balances() if current is None else dict(current)
    debtors = sorted(((u, -c) for u, c in current.items() if c < 0), key=lambda x: -x[1])
    creditors = sorted(((u, c) for u, c in current.items() if c > 0), key=lambda x: -x[1])

    transfers = []
    debtors = [list(d) for d in debtors]
    creditors = [list(c) for c in creditors]
    i = j = 0
    while i < len(debtors) and j < len(creditors):
        amount = min(debtors[i][1], creditors[j][1])
        if amount > 0:
            transfers.append({
                "from_user_id": debtors[i][0],
                "to_user_id": creditors[j][0],
                "amount_cents": amount,
            })
        debtors[i][1] -= amount
        creditors[j][1] -= amount
        if debtors[i][1] == 0:
            i += 1
        if creditors[j][1] == 0:
            j += 1
    return transfers


def owed_between(from_user_id, to_user_id):
    """How much the suggestion says one owes the other, in cents."""
    return sum(
        t["amount_cents"] for t in suggested_transfers()
        if t["from_user_id"] == from_user_id and t["to_user_id"] == to_user_id
    )


def settle_finished(tournament_id):
    """Called when a tournament reaches its end."""
    try:
        tournament = Tournament.objects.get(id=tournament_id)
    except Tournament.DoesNotExist:
        return False
    return settle_tournament(tournament)
