"""Blackjack against the dealer: the arithmetic, and nothing else.

Twenty-one is a game with very few decisions in it and a great many edge cases,
and almost every edge case is an ace. An ace is worth eleven until eleven would
bust the hand and then it is worth one — which sounds like a single sentence and
is the reason this module exists on its own. An ace counted as eleven when it
had to be one is somebody's coins, so the rule lives in one function that a test
can hammer rather than being spelled out again at each of the five places that
need it.

Everything here is arithmetic over lists of card strings in the engine's format:
a rank character and a suit letter, "Th", "As", "9s". No database, no deck kept
between calls, no state that survives a return. The shuffle takes its generator
as an argument exactly the way spingo.draw_multiplier does, so a test can stack
the deck and know what the next card is; without one it uses the module-level
`random`, seeded from the OS.

The house rules below are decisions rather than laws, and each of them costs or
saves the house something:

* One 52-card deck, reshuffled every round. Nothing here can be counted, which
  is the point — counting a single deck that is thrown away after one hand is
  not a strategy.
* The dealer stands on soft 17. The kinder of the two standard rules, and the
  one that makes the game explicable: the dealer's whole policy is then "draw
  under seventeen", with no second clause about what kind of seventeen it is.
* A blackjack pays 3:2, rounded down. Rounding down rather than up because the
  alternative is a stake of 5 paying 8 back on a 7.5, and a house that rounds in
  the player's favour on every odd stake is a faucet nobody meant to open.
* Doubling takes exactly one card, and the hand is then over whatever it came
  to. That is what makes it a double and not a licence to keep drawing.
* Splitting is allowed on equal RANK only. K+Q is twenty either way, but it is
  not a pair, and a house that lets you split it is giving away the difference.
* No re-splitting — two hands is the maximum — and split aces get one card each
  and are done. Both of those are limits on the same thing: an ace is the best
  card in the deck and the split is the cheapest way to get more of them.
* No insurance and no surrender. Insurance is a side bet on the dealer's hole
  card that is bad for the player at these odds, and explaining it costs more
  than it is worth.

Two more that the contract does not name either way, and that were decided here
because something had to be:

* A hand that reaches twenty-one stands rather than staying live. Every card in
  the deck busts a twenty-one, so a Hit button offered on one is a trap and not
  a choice. See status_after_card.
* The dealer is checked for blackjack on the deal — the peek — and a round it
  finds one in is over before the player has acted. Without it a player doubles
  or splits into a hand that was lost before they touched it and pays a second
  stake to find out. The check itself is in blackjackbank.deal, where the cards
  are; the rule is here because it is a rule.
"""

import random

# The card vocabulary, in the format game/engine/card.py prints. Ten is "T" so
# that every card is exactly two characters and a hand is a list of equal-width
# strings rather than a parsing problem.
RANKS = "23456789TJQKA"
SUITS = "hdcs"

# What the dealer's hole card is called on the wire while the player is still
# deciding. It never reaches any function in this module: the hiding happens
# when the round is drawn for the client, not in the round itself, so nothing
# here ever has to wonder what a "??" is worth.
HIDDEN = "??"

TWENTY_ONE = 21

# The dealer draws below this and stands on it, soft or hard. See the note at
# the top: a house that hits soft 17 would read `total < 17 or (total == 17 and
# soft)`, and the extra clause is the whole difference between the two games.
DEALER_STANDS_ON = 17

# A blackjack pays three for two, as a pair rather than as 1.5 — the payout is
# integer arithmetic and a float would have introduced a rounding rule nobody
# chose.
BLACKJACK_PAYS = (3, 2)

# Two hands, never three. See the note at the top about re-splitting.
MAX_HANDS = 2

# What a hand is doing. "blackjack" is a status and not only an outcome because
# a natural stops the hand where it stands: there is nothing to decide on it and
# it must not be offered a hit.
PLAYING = "playing"
STOOD = "stood"
BUST = "bust"
BLACKJACK = "blackjack"

# How a hand ended up against the dealer. "blackjack" is separate from "win"
# because it is paid differently and because the client says so out loud.
WIN = "win"
LOSE = "lose"
PUSH = "push"

# What a round is doing. The same two words the API contract uses.
FINISHED = "finished"

NO_ACTIONS = {"hit": False, "stand": False, "double": False, "split": False}


def fresh_deck(rng=None) -> list:
    """A shuffled 52, as card strings, dealt from the front.

    A new one every round rather than a shoe that is dealt down: a round is the
    unit of everything here — one row, one stake, one settlement — and a deck
    that outlived it would be state the player could reason about.

    The generator is an argument so a test can stack it. Without one this uses
    the module-level `random`, which is not cryptography but must not be
    predictable from the last hand either.
    """
    rng = rng or random
    deck = [rank + suit for rank in RANKS for suit in SUITS]
    rng.shuffle(deck)
    return deck


def draw(deck: list) -> str:
    """Take the top card, off the front, mutating the deck it came from.

    The front rather than the back so that a stacked deck reads in dealing
    order in a test — `["As", "Kd", ...]` is the ace first, which is what
    anybody writing the test meant.
    """
    return deck.pop(0)


def card_rank(card: str) -> str:
    """The rank character of a card: "T" of "Th"."""
    return (card or "")[:1]


def card_value(card: str) -> int:
    """What one card is worth, counting every ace as eleven.

    Eleven rather than one because hand_value below is the only place that
    knows how to change its mind, and it needs a starting position to change it
    from. A picture is ten; there is no card worth anything else.
    """
    rank = card_rank(card)
    if rank == "A":
        return 11
    if rank in "TJQK":
        return 10
    return int(rank)


def hand_value(cards) -> tuple:
    """(total, soft) — what the hand is worth and whether an ace is doing it.

    Every ace starts as eleven and is demoted to one, one at a time, only while
    the hand is over twenty-one. That ordering is the whole rule: a hand is
    always worth the most it can be worth without busting, and demoting an ace
    that did not need demoting would quietly cost the player ten.

    "Soft" means an ace is still being counted as eleven, which is what makes
    the hand safe to hit — a soft 17 cannot bust on the next card. A+6 is a soft
    17; A+6+K is a hard 17, because by then the ace has had to become a one.
    """
    total = 0
    # Aces still being counted as eleven. This is the number that gets spent.
    high_aces = 0
    for card in cards:
        value = card_value(card)
        if card_rank(card) == "A":
            high_aces += 1
        total += value

    while total > TWENTY_ONE and high_aces:
        total -= 10
        high_aces -= 1

    return total, high_aces > 0


def total_of(cards) -> int:
    """The hand's value, for the callers that do not care how it got there."""
    return hand_value(cards)[0]


def is_bust(cards) -> bool:
    return total_of(cards) > TWENTY_ONE


def is_blackjack(cards, from_split: bool = False) -> bool:
    """An ace and a ten-card, as the first two cards, in a hand nobody split.

    Two conditions, and the second one is the one that gets forgotten: twenty-
    one made of three cards is twenty-one and pays even money, and twenty-one
    made from a split ace is twenty-one too. Paying 3:2 on either is paying for
    a hand the player was not dealt.
    """
    return not from_split and len(cards) == 2 and total_of(cards) == TWENTY_ONE


def is_natural(hand: dict) -> bool:
    """is_blackjack, for a hand dictionary rather than a list of cards."""
    return is_blackjack(hand.get("cards") or [], hand.get("from_split", False))


def dealer_should_hit(cards) -> bool:
    """Whether the dealer draws again. Stands on soft 17 — see DEALER_STANDS_ON.

    The dealer has no choices, which is why the house edge is where it is: it
    must draw on a hard 16 against a six even though a player never would, and
    it must stand on a soft 17 even when standing cannot win.
    """
    return total_of(cards) < DEALER_STANDS_ON


def play_dealer(cards: list, deck: list) -> list:
    """Draw for the dealer until the policy stops, mutating both lists."""
    while dealer_should_hit(cards):
        cards.append(draw(deck))
    return cards


def dealer_must_play(hands) -> bool:
    """Whether the dealer has anything left to draw for.

    Not when every hand went bust: those are already lost, the coins are already
    the house's, and cards dealt afterwards would only look like the house was
    chasing a hand it had won. Not when the only hand is a natural either — by
    the time this is asked the dealer has been checked for blackjack and has
    none, so a natural is already paid and what the dealer would have drawn to
    cannot change it.
    """
    return any(not is_bust(hand["cards"]) and not is_natural(hand) for hand in hands)


def new_hand(cards, stake: int, from_split: bool = False) -> dict:
    """One player hand, in the shape it is stored and served in.

    Built here rather than inline at the three places that make one, so the
    shape is defined once — a hand that reached the client missing `returned`
    would be a hand the client draws a zero against forever.
    """
    return {
        "cards": list(cards),
        # What this hand alone is playing for. A doubled hand carries the
        # doubled figure, because that is what it wins or loses.
        "stake": int(stake),
        "doubled": False,
        "from_split": bool(from_split),
        "status": PLAYING,
        "outcome": None,
        "returned": 0,
    }


def status_after_card(cards, one_card_only: bool = False) -> str:
    """What a hand becomes the moment a card lands on it.

    Twenty-one ends the hand rather than leaving it live. There is nothing to
    decide on twenty-one — every card in the deck busts it — and a Hit button
    offered on a hand that cannot survive being hit is a trap rather than a
    choice.

    `one_card_only` is the double: the hand is over at whatever it came to, even
    a twelve, because that is what doubling buys.
    """
    total = total_of(cards)
    if total > TWENTY_ONE:
        return BUST
    if one_card_only or total == TWENTY_ONE:
        return STOOD
    return PLAYING


def actions_for(hands, index: int, active) -> dict:
    """What this hand may legally do — the `can` object the client is served.

    The server's word, and the only word: an action arriving on an endpoint is
    checked against this again rather than trusted, because a client that offers
    a fifth card on a doubled hand is either broken or somebody's script.

    Everything is false for a hand that is not the one being played, which
    includes every hand once the round is over.
    """
    if index != active or index >= len(hands):
        return dict(NO_ACTIONS)

    hand = hands[index]
    if hand.get("status") != PLAYING:
        return dict(NO_ACTIONS)

    cards = hand["cards"]
    # Doubling and splitting are both "on the first two cards" — once a hand has
    # been hit it is an ordinary hand that can only be hit again or stood.
    untouched = len(cards) == 2
    return {
        "hit": True,
        "stand": True,
        "double": untouched,
        # Equal rank, and no re-splitting: with two hands already in play there
        # is no room for a third, whichever of them is holding the pair.
        "split": (
            untouched
            and len(hands) < MAX_HANDS
            and card_rank(cards[0]) == card_rank(cards[1])
        ),
    }


def returns_for(outcome: str, stake: int) -> int:
    """Coins back to a hand, the stake included.

    Returned rather than won, because the stake left the wallet when the cards
    were dealt: a push pays the stake back and is worth nothing, and saying so
    in one number is what lets the round report a net without the client doing
    arithmetic of its own.
    """
    stake = max(0, int(stake))
    if outcome == BLACKJACK:
        # Three for two on top of the stake. Floor division: see BLACKJACK_PAYS.
        numerator, denominator = BLACKJACK_PAYS
        return stake + stake * numerator // denominator
    if outcome == WIN:
        return stake * 2
    if outcome == PUSH:
        return stake
    return 0


def settle(hands, dealer_cards) -> list:
    """How each hand ended against the dealer, and what it gets back.

    Reads the cards rather than the statuses. A status is bookkeeping written by
    whichever endpoint last touched the round; the cards are what was actually
    dealt, and if the two ever disagree it is the cards that were paid for.

    The order of the clauses is the rule set, and it is worth reading as one:
    a bust hand has already lost and the dealer's hand is none of its business,
    which is the entire house edge. Then the dealer's blackjack, which beats
    every twenty-one that was not itself a blackjack and pushes against one that
    was. Then everybody else, high hand wins, equal is a push.
    """
    dealer_total = total_of(dealer_cards)
    dealer_blackjack = is_blackjack(dealer_cards)
    dealer_bust = dealer_total > TWENTY_ONE

    results = []
    for hand in hands:
        cards = hand["cards"]
        if is_bust(cards):
            # Lost the moment it happened, whatever the dealer goes on to do.
            outcome = LOSE
        elif is_natural(hand):
            outcome = PUSH if dealer_blackjack else BLACKJACK
        elif dealer_blackjack:
            outcome = LOSE
        elif dealer_bust or total_of(cards) > dealer_total:
            outcome = WIN
        elif total_of(cards) == dealer_total:
            outcome = PUSH
        else:
            outcome = LOSE
        results.append({"outcome": outcome, "returned": returns_for(outcome, hand["stake"])})
    return results
