"""Who owes whom, from what tournaments decided.

The app never moves money. It records what each finished tournament worked out,
keeps a running balance per player, and lets the person who received a payment
say so.

Everything is in integer cents. Money in floats drifts, and the drift here is
somebody's actual euro.
"""

from collections import defaultdict

from django.db import transaction

from .bounties import BountyConfig, prize_pool_share_cents
from .models import DebtTransfer, LedgerEntry, Settlement, Tournament


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

    bounty = BountyConfig.from_tournament(tournament)

    with transaction.atomic():
        if LedgerEntry.objects.filter(tournament=tournament).exists():
            return False  # already settled

        players = list(tournament.players.select_related("user"))
        if not players:
            return False

        # Each rebuy is another buy-in, so the pot grows with them — and in a
        # bounty game each rebuy also puts a fresh bounty back on the head.
        entries = {p.user_id: 1 + p.rebuy_count for p in players}
        stakes = {user_id: tournament.buy_in_cents * count for user_id, count in entries.items()}

        # Only the non-bounty part of every buy-in is played for by placing.
        # The bounty part was paid out hand by hand as knockouts happened.
        placing_pot = sum(
            prize_pool_share_cents(bounty, tournament.buy_in_cents) * count
            for count in entries.values()
        )

        prizes = _prizes_for(placing_pot, payouts, {p.user_id: p.finish_position for p in players})

        # What each player collected off other people's heads, plus whatever is
        # still on their own. A knockout empties the victim's head into the
        # eliminator's, so a head with anything left on it belongs to somebody
        # nobody knocked out: the winner, or a player who quit or timed out.
        # Counting it back to them is what makes the bounty pool add up — every
        # cent that went onto a head comes off it exactly once.
        bounty_prizes = {
            p.user_id: (p.bounty_won_cents or 0) + (p.bounty_cents or 0)
            for p in players
        } if bounty.enabled else {}

        # A mystery pool sits on nobody's head, so there is nothing to hand
        # back: what a player collected is what they drew. Whatever nobody drew
        # goes to the winner, and that is worked out from the pool rather than
        # from the envelopes still on the board — the board is empty both when
        # every envelope has been drawn and when the tournament ended before
        # they were ever cut, and those two mean opposite things. Subtracting
        # what was collected from what the buy-ins put in is right either way,
        # and is what stops a pool that never opened simply vanishing.
        if bounty.is_mystery:
            bounty_prizes = {p.user_id: (p.bounty_won_cents or 0) for p in players}
            pool = bounty.amount_cents * sum(entries.values())
            unclaimed = pool - sum(bounty_prizes.values())
            if unclaimed > 0:
                champion = next((p for p in players if p.finish_position == 1), None)
                if champion is not None:
                    bounty_prizes[champion.user_id] = bounty_prizes.get(champion.user_id, 0) + unclaimed

        LedgerEntry.objects.bulk_create([
            LedgerEntry(
                tournament=tournament,
                user_id=user_id,
                stake_cents=stake,
                prize_cents=prizes.get(user_id, 0) + bounty_prizes.get(user_id, 0),
                bounty_prize_cents=bounty_prizes.get(user_id, 0),
            )
            for user_id, stake in stakes.items()
        ])

        # What this night added to the pile, paired off and written down while we
        # are still inside the transaction that recorded it.
        plan_transfers()
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


def _promised():
    """{user_id: cents} — what the promises still standing will bring each player.

    Positive means promises are pointed at them, negative means they have
    promised it to somebody. Sums to zero, since every promise has two ends.
    """
    promised = defaultdict(int)
    for transfer in DebtTransfer.objects.all():
        remaining = transfer.remaining_cents
        if remaining:
            promised[transfer.to_user_id] += remaining
            promised[transfer.from_user_id] -= remaining
    return promised


def plan_transfers():
    """Write down payments for debt that no promise covers yet.

    Existing promises are left exactly as they are, however the balances have
    moved since — that is the whole point of writing them down. What gets paired
    off is the gap between where a player's balance actually stands and where the
    promises already made would leave them, so a new night adds payments instead
    of rewriting the ones people are already acting on.

    Working from the gap rather than from the raw balance also copes with a
    player who owed money last month and is up overall this month: the promise
    they made still stands, and the winnings that cancel it arrive as somebody
    else's promise to them rather than by quietly erasing it.
    """
    net = balances()
    promised = _promised()

    unpromised = {
        user_id: net.get(user_id, 0) - promised.get(user_id, 0)
        for user_id in set(net) | set(promised)
    }
    unpromised = {user_id: cents for user_id, cents in unpromised.items() if cents}

    fresh = [
        DebtTransfer(
            from_user_id=transfer["from_user_id"],
            to_user_id=transfer["to_user_id"],
            amount_cents=transfer["amount_cents"],
        )
        for transfer in suggested_transfers(unpromised)
    ]
    return DebtTransfer.objects.bulk_create(fresh)


def open_transfers():
    """The payments still outstanding, in the order they were agreed."""
    return [
        {
            "from_user_id": transfer.from_user_id,
            "to_user_id": transfer.to_user_id,
            "amount_cents": transfer.remaining_cents,
        }
        for transfer in DebtTransfer.objects.all()
        if transfer.remaining_cents
    ]


def owed_between(from_user_id, to_user_id):
    """How much of what one promised the other is still outstanding, in cents."""
    return sum(
        transfer.remaining_cents
        for transfer in DebtTransfer.objects.filter(
            from_user_id=from_user_id, to_user_id=to_user_id,
        )
    )


def apply_settlement(from_user_id, to_user_id, amount_cents):
    """Record money received, against the promises it pays off.

    Oldest debt first, so a part payment clears the thing they have owed longest.
    Returns the Settlement, or None when it is more than is outstanding between
    these two — which is the one thing the receiver must not be able to invent,
    since the balance it would move belongs to somebody else.
    """
    with transaction.atomic():
        transfers = list(
            DebtTransfer.objects.filter(from_user_id=from_user_id, to_user_id=to_user_id)
        )
        if amount_cents > sum(transfer.remaining_cents for transfer in transfers):
            return None

        left = amount_cents
        for transfer in transfers:
            if left <= 0:
                break
            taken = min(left, transfer.remaining_cents)
            if taken:
                transfer.paid_cents += taken
                transfer.save(update_fields=["paid_cents"])
                left -= taken

        return Settlement.objects.create(
            from_user_id=from_user_id, to_user_id=to_user_id, amount_cents=amount_cents,
        )


def settle_finished(tournament_id):
    """Called when a tournament reaches its end."""
    try:
        tournament = Tournament.objects.get(id=tournament_id)
    except Tournament.DoesNotExist:
        return False
    return settle_tournament(tournament)
