"""Blackjack where the rules meet the wallet.

blackjack.py knows what a hand is worth and nothing about coins; economy.py
moves coins and knows nothing about cards. This is the seam, and it is the only
file in the three that can get somebody's balance wrong, so everything it does
is arranged around two dangers.

The first is paying twice. Every coin move for a round is memoed
`blackjack:{id}`, following tournaments/coinbank.py, and the settlement refuses
to run if a payout carrying that memo already exists. That guard is not the
first line of defence, it is the last one: a round is settled inside the same
transaction that holds a `select_for_update` on its row, so two requests racing
on the same round are already serialised. The memo is what catches the case the
lock cannot — a settlement attempted again after the first one committed.

The second is charging for something that did not happen. Coins come off inside
the same transaction that writes what they bought: the deal charges after the
round row exists and rolls the row back if the wallet cannot cover it, and a
double or a split takes its second stake before the card is dealt rather than
after. A hand that was dealt and never paid for is a hand the house gave away;
a stake taken for a card that was never dealt is worse, because the player can
see it happen.

What is *not* here is any decision about what is legal. Every action is checked
against blackjack.actions_for before it is applied, and the client's opinion
about which buttons it drew is never consulted.
"""

from django.db import IntegrityError, transaction
from django.utils import timezone

from . import blackjack, games
from .economy import grant, spend, wallet_for
from .games import clean_stake
from .models import BlackjackRound, CoinLedger


def stake_memo(round_id) -> str:
    """What every coin move for this round is stamped with."""
    return f"blackjack:{round_id}"


def open_round(user):
    """This player's unfinished round, or None.

    There is at most one — the database says so, see BlackjackRound.Meta — but
    this orders anyway, so that a row somehow left open by a crash before the
    constraint existed loses to the newest one rather than trapping the player
    in it forever.
    """
    return (
        BlackjackRound.objects
        .filter(user=user, status=blackjack.PLAYING)
        .order_by("-id")
        .first()
    )


def _locked_round(user):
    """The unfinished round, held under a row lock until the transaction ends.

    Must be called inside `transaction.atomic`. This is what makes a double-
    submitted Hit deal one card instead of two: the second request blocks here
    until the first has written its card and committed, and then reads the round
    as it now is rather than as it was when the button was pressed.
    """
    return (
        BlackjackRound.objects
        .select_for_update()
        .filter(user=user, status=blackjack.PLAYING)
        .order_by("-id")
        .first()
    )


# The fields every action writes. Spelled out rather than a bare save() so that
# a stray attribute set somewhere else cannot ride along with a card.
ROUND_FIELDS = ["deck", "dealer", "hands", "active", "status", "net", "finished_at"]


def _save(round_):
    round_.save(update_fields=ROUND_FIELDS)


def _pay(round_) -> int:
    """Grant what a settled round returned. Safe to attempt twice.

    Returns nothing when the round returned nothing, which is the ordinary case
    for a losing hand — there is no ledger row for coins that never moved, so a
    lost round leaves the wallet alone and says so with a net.
    """
    total = sum(hand["returned"] for hand in round_.hands)
    if total <= 0:
        return 0
    memo = stake_memo(round_.id)
    if CoinLedger.objects.filter(reason="payout", memo=memo).exists():
        return 0
    grant(round_.user, total, "payout", memo=memo)
    return total


def _finish(round_) -> None:
    """Play the dealer out, settle every hand, and pay.

    The dealer draws here and nowhere else, which is why the hole card can stay
    hidden until this runs: until the player is done there is nothing to draw
    for, and once they are done there is no decision left that knowing the card
    could affect.
    """
    if blackjack.dealer_must_play(round_.hands):
        blackjack.play_dealer(round_.dealer, round_.deck)

    for hand, result in zip(round_.hands, blackjack.settle(round_.hands, round_.dealer)):
        hand["outcome"] = result["outcome"]
        hand["returned"] = result["returned"]

    # Everything that came back, less everything that went out — the doubled and
    # split stakes included, because each hand carries its own. This is the one
    # number the player reads, so it is stored rather than recomputed.
    round_.net = (
        sum(hand["returned"] for hand in round_.hands)
        - sum(hand["stake"] for hand in round_.hands)
    )
    round_.status = blackjack.FINISHED
    round_.active = None
    round_.finished_at = timezone.now()
    _pay(round_)


def _advance(round_) -> None:
    """Move on to the next hand with something to decide, or end the round.

    Hands are played in order and a hand only ever leaves `playing` for good, so
    the first one still playing is the next one to act. After a split that is
    the second hand; after split aces there is no such hand and the round goes
    straight to the dealer.
    """
    nxt = next(
        (i for i, hand in enumerate(round_.hands) if hand["status"] == blackjack.PLAYING),
        None,
    )
    if nxt is not None:
        round_.active = nxt
        return
    _finish(round_)


def deal(user, stake_value, rng=None):
    """Start a round. Returns the BlackjackRound, or a string saying why not.

    The cards go out in the order they would across a real table — player,
    dealer's up card, player, dealer's hole card — because a stacked deck in a
    test should read the way a deal looks, and because the order decides which
    card the hole card is if this ever grows a second seat.

    A round can be over before the player has touched it, in two ways. A natural
    has nothing to decide and is paid at once. And the dealer is checked for
    blackjack on the deal — the peek — so that nobody doubles or splits into a
    hand that was already lost before they acted. The contract does not name the
    peek either way; it is the standard rule and it is the one that costs a
    player least.
    """
    stake = clean_stake(games.BLACKJACK, stake_value)
    if stake is None:
        return (
            f"A stake is between {games.BLACKJACK.min_stake} "
            f"and {games.BLACKJACK.max_stake} coins."
        )

    # Asked before anything is written, so the ordinary refusal is an ordinary
    # answer rather than a rolled-back transaction. The spend below is what
    # actually decides; this only keeps the common case cheap.
    if wallet_for(user).balance < stake:
        return "Not enough coins."

    try:
        with transaction.atomic():
            if open_round(user) is not None:
                return "Finish the round you are already playing."

            deck = blackjack.fresh_deck(rng)
            round_ = BlackjackRound.objects.create(
                user=user, stake=stake, deck=deck, dealer=[], hands=[],
                active=0, status=blackjack.PLAYING,
            )

            # Charged before a card is dealt and inside the same transaction as
            # the row: a round nobody paid for pays out coins from nowhere.
            if spend(user, stake, "stake", memo=stake_memo(round_.id)) is None:
                transaction.set_rollback(True)
                return "Not enough coins."

            player = [blackjack.draw(deck)]
            dealer = [blackjack.draw(deck)]
            player.append(blackjack.draw(deck))
            dealer.append(blackjack.draw(deck))

            hand = blackjack.new_hand(player, stake)
            if blackjack.is_blackjack(player):
                hand["status"] = blackjack.BLACKJACK
            round_.hands = [hand]
            round_.dealer = dealer

            if hand["status"] != blackjack.PLAYING or blackjack.is_blackjack(dealer):
                _finish(round_)
            _save(round_)
    except IntegrityError:
        # Two taps on Deal at once. The constraint on the table decided which of
        # them opened the round, and this is the loser, so it is refused exactly
        # the way the slower of two taps a second apart would have been — the
        # caller hands back the round that won along with the refusal.
        return "Finish the round you are already playing."

    return round_


def _act(user, action: str, apply):
    """The shape every move shares: lock, check it is legal, apply, advance.

    `apply` is handed the round and its active hand and does the part that
    differs. It may return a string, which is refused as an error and rolls
    nothing back because nothing has been written yet at that point.
    """
    with transaction.atomic():
        round_ = _locked_round(user)
        if round_ is None or round_.active is None:
            # No round, or a round left open with nothing active on it, which
            # nothing here can produce but which must not become a traceback.
            return "There is no round to play."

        # The client's word on what it drew is not consulted. This is the same
        # function that built the `can` object it was served, asked again now
        # that the round may have moved on.
        if not blackjack.actions_for(round_.hands, round_.active, round_.active)[action]:
            return f"You cannot {action} that hand."

        refusal = apply(round_, round_.hands[round_.active])
        if refusal is not None:
            return refusal

        _advance(round_)
        _save(round_)
    return round_


def hit(user):
    """One more card. The hand ends here if it busts or reaches twenty-one."""
    def apply(round_, hand):
        hand["cards"].append(blackjack.draw(round_.deck))
        hand["status"] = blackjack.status_after_card(hand["cards"])
    return _act(user, "hit", apply)


def stand(user):
    """Keep what you have and move on."""
    def apply(round_, hand):
        hand["status"] = blackjack.STOOD
    return _act(user, "stand", apply)


def double(user):
    """Second stake, exactly one card, and the hand is over at whatever it makes."""
    def apply(round_, hand):
        # The same again as this hand is already playing for, which for a hand
        # that can still be doubled is always the opening stake.
        extra = hand["stake"]
        if spend(user, extra, "stake", memo=stake_memo(round_.id)) is None:
            return "Not enough coins to double."
        hand["stake"] += extra
        hand["doubled"] = True
        hand["cards"].append(blackjack.draw(round_.deck))
        hand["status"] = blackjack.status_after_card(hand["cards"], one_card_only=True)
    return _act(user, "double", apply)


def split(user):
    """Two hands out of a pair, each with its own stake and its own second card.

    Split aces are dealt their one card and then stand, whatever it was. That is
    the rule that makes splitting aces merely very good rather than the best bet
    on the table, and it is enforced by finishing the hands here rather than by
    refusing a Hit later — a hand that cannot be hit should not be offered the
    button in the first place.
    """
    def apply(round_, hand):
        stake = hand["stake"]
        if spend(user, stake, "stake", memo=stake_memo(round_.id)) is None:
            return "Not enough coins to split."

        aces = blackjack.card_rank(hand["cards"][0]) == "A"
        halves = [
            blackjack.new_hand([card], stake, from_split=True) for card in hand["cards"]
        ]
        for half in halves:
            half["cards"].append(blackjack.draw(round_.deck))
            half["status"] = blackjack.status_after_card(half["cards"], one_card_only=aces)
        round_.hands = halves
        # Back to the first of the two, which _advance will confirm or move past
        # if split aces have already ended both of them.
        round_.active = 0
    return _act(user, "split", apply)


__all__ = ["deal", "hit", "stand", "split", "double", "open_round", "stake_memo"]
