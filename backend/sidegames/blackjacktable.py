"""The shared blackjack table: a clock nobody has to wind, and eight wallets.

blackjackbank.py is this file's twin for the solo game, and the two are shaped
alike on purpose — the rules come from blackjack.py, the coins come from
economy.py, and what lives in between is the part that can get somebody's
balance wrong. Everything below exists because a table with eight people at it
raises two problems a table with one person at it does not.

The first is whose turn it is. This table went round the seats all at once for a
while — one window, everybody acting inside it — because seat by seat needs a
per-seat clock and an answer to what happens when one player puts their phone
down and freezes seven other people. It goes seat by seat now, which is how
blackjack is actually dealt, and the two problems are answered rather than
avoided:

* The clock is per turn. A turn that runs out stands the seat on what it has,
  exactly as the shared window used to, and the turn moves along. Nobody can
  freeze the table for longer than one turn's worth of it.
* A player who has already made up their mind says so in advance — see
  `planned` on the seat — and their turn is played and passed on the instant it
  reaches them. Seven people waiting for one is the real cost of dealing in
  order, and this is what buys most of it back.

The order is from the right: seat seven is first base and the turn counts down
to seat zero, which is the order the cards were dealt in. Seats with nothing
left to decide are never given a turn at all, and a turn ends the moment its
seat has no undecided hand left rather than when its clock runs out — so a
table of quick players moves at the speed of the players. When the last seat is
done the dealer draws once and every hand settles against that one hand, which
is the thing a shared table is for and the thing eight parallel solo games could
never give you.

The dealer's hole card stays face down until the round is settling, so none of
the above may hold a finished round open: a clock still running after the last
decision is a table watching a countdown for a card whose value is already
fixed.

The second is who moves the clock. Nothing here runs in the background: no
worker, no task, no loop. `advance()` reads the stored `phase_ends_at`, works
out what should have happened since, and does it — possibly several phases at
once for a table nobody has touched in five minutes — and every endpoint calls
it at the top, inside the transaction, holding a row lock on the table. So a
phase change is not an event that fires; it is a conclusion that whoever looks
next is obliged to reach. Two requests arriving together are serialised by the
lock, the second one finds the work already done, and the walk is written to be
idempotent so that finding it done is an ordinary outcome rather than a bug.

Money follows blackjackbank exactly. Coins leave the wallet when the bet is
placed and when a double or a split takes a second stake, they come back at
settlement, and every one of those moves is memoed with the table, the round
and the seat. The memo is what makes a settlement that somehow runs twice pay
once: the row lock is the guard that ordinarily prevents it, and the memo is the
one that catches what the lock cannot, which is a second attempt after the first
has already committed.

Two decisions the contract left open, made here because something had to be:

* The shoe is two decks rather than one. Eight seats that all split and double
  can ask for more than fifty-two cards before the dealer has drawn, and a deck
  that runs out in the middle of a hand is an exception thrown across somebody's
  money. It is still shuffled fresh every round, so there is still nothing to
  count. See fresh_shoe.
* A round the dealer's peek has already decided goes straight to `settling`
  rather than opening a `playing` window. A dealer blackjack ends the round
  before anybody acts — that is the solo game's rule too, and it is what stops a
  player doubling into a hand that was lost before they touched it — and holding
  eight people in front of buttons that cannot be pressed for twenty seconds
  would be showing them a decision they do not have.
"""

from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from . import blackjack, games
from .economy import grant, spend, wallet_for
from .games import clean_stake
from .models import BlackjackSeat, BlackjackTable, CoinLedger

BETTING = BlackjackTable.BETTING
PLAYING = BlackjackTable.PLAYING
SETTLING = BlackjackTable.SETTLING

# How long each window is open. Betting is short because a table that spends
# most of its time waiting for bets feels broken; settling is long enough to
# read a result and not long enough to get bored of it. Playing is now ONE
# SEAT'S turn rather than the whole table's window, which is why it is shorter
# than the twenty seconds it used to be — eight of these end to end is already
# a long time to sit through, and the two things that keep it short in practice
# are that a turn ends when its seat is done and that a seat which planned its
# move never costs the table a full one.
PHASE_SECONDS = {BETTING: 12, PLAYING: 10, SETTLING: 6}

# Six rather than eight. Eight fitted on the row and not on the felt: two
# players sitting next to each other who each drew twice had four cards where
# there was room for two, and the tiles overlapped into each other. Six is the
# most this table can seat and still give everybody a hand you can read, and the
# layout spreads whoever is actually there across the room the empties are no
# longer taking — see the client.
SEATS = 6

# Betting windows in a row a seat may sit out before it is given up. Three is
# about thirty-six seconds of a seat held by somebody who is not playing.
IDLE_LIMIT = 3

# Two 52s. See the note in the module docstring: one is not enough for eight
# seats in the worst case, and running out of cards mid-hand is not a risk worth
# taking to keep a number at fifty-two.
SHOE_DECKS = 2

# How many phases one call to advance() will walk through before it gives up and
# simply opens a fresh betting window. It cannot legitimately be reached — an
# unattended table empties its seats within three betting windows and then snaps
# its clock to the present, so the real ceiling is about four cycles however
# long the table was left — but a loop that walks a stored timestamp forward is
# exactly the kind of loop that must not be able to run away.
CATCH_UP_LIMIT = 32

# Spelled out rather than a bare save(), so that a stray attribute set somewhere
# else cannot ride along with a phase change. Same discipline as
# blackjackbank.ROUND_FIELDS.
TABLE_FIELDS = ["phase", "phase_ends_at", "round_number", "deck", "dealer", "turn"]
SEAT_FIELDS = ["bet", "hands", "net", "idle_rounds", "planned"]

PUBLIC = "main"


# ---------------------------------------------------------------------------
# The decisions, with no database anywhere near them.
# ---------------------------------------------------------------------------

def seconds_left(phase_ends_at, now=None) -> float:
    """How long this window has to run, never negative.

    Floored at zero rather than allowed to go negative, because a client draws
    this as a bar and a bar with minus four seconds in it is a bug the player
    can see. A table that is late simply reads zero until somebody's request
    advances it.
    """
    now = now or timezone.now()
    return max(0.0, (phase_ends_at - now).total_seconds())


def phase_after(phase: str, dealt: bool) -> str:
    """Which window opens when this one closes.

    `dealt` is the whole of the interesting case: a betting window that closed
    with money on the table starts a round, and one that closed with none of it
    starts another betting window. Nothing else here branches, which is the
    reward for making everybody act at once.
    """
    if phase == BETTING:
        return PLAYING if dealt else BETTING
    if phase == PLAYING:
        return SETTLING
    return BETTING


def active_hand(hands):
    """Which of a seat's hands is the one being played, or None.

    Worked out rather than stored. Hands are played in order and a hand only
    ever leaves "playing" for good, so the first one still playing is the next
    one to act — after a split that is the first half, and after split aces,
    which are dealt one card each and are done, there is no such hand at all.
    """
    return next(
        (i for i, hand in enumerate(hands) if hand.get("status") == blackjack.PLAYING),
        None,
    )


def turn_after(seats, current=None):
    """Which seat acts next, or None when nobody at the table has to be asked.

    Counting DOWN from the right: seat seven is first base and the turn works
    back to seat zero, which is the order the cards came out in. `current` is
    the seat that has just finished — pass None for the first turn of a round.

    Seats with nothing left to decide are skipped rather than given a turn they
    would only be able to sit through: a natural, a hand already stood, a seat
    that never bet. That is also what makes this the whole of the "is the round
    over" question — no next seat means no decisions left anywhere.
    """
    waiting = [
        seat.seat for seat in seats
        if seat.hands and active_hand(seat.hands) is not None
        and (current is None or seat.seat < current)
    ]
    return max(waiting, default=None)


def fresh_shoe(rng=None) -> list:
    """Two shuffled 52s, dealt from the front.

    Shuffled fresh every round like the solo game's single deck, so the second
    deck buys depth rather than anything countable: a shoe that is thrown away
    after one hand cannot be counted however many cards are in it.
    """
    shoe = []
    for _ in range(SHOE_DECKS):
        shoe.extend(blackjack.fresh_deck(rng))
    return shoe


def seat_memo(table, seat_number: int) -> str:
    """What every coin move for this seat in this round is stamped with.

    The table id is in it as well as the round, because the round counter is
    only unique within one table and a second table would otherwise write memos
    that collide with this one's — at which point the payout guard in `_pay`
    would look at somebody else's settlement and decide this one had already
    happened. That is a bug that pays nobody and says nothing.
    """
    return f"bjtable:{table.id}-{table.round_number}:{seat_number}"


# ---------------------------------------------------------------------------
# The table itself.
# ---------------------------------------------------------------------------

def public_table():
    """The one public table, opened the first time anybody looks at it.

    Created on demand rather than by a migration or a fixture, exactly as
    economy.wallet_for opens a wallet: there is nothing to run and nothing to
    remember to run, and a fresh database grows a table the moment somebody
    asks for one.
    """
    table, _ = BlackjackTable.objects.get_or_create(key=PUBLIC)
    return table


def locked_table(now=None, rng=None):
    """The table, held under a row lock and walked up to date.

    Must be called inside `transaction.atomic`, and is the first thing every
    endpoint does. The lock is what makes the lazy clock safe: two requests
    arriving in the same millisecond both want to close the same betting window
    and deal the same round, and the second one blocks here until the first has
    committed and then reads a table that has already moved on.
    """
    public_table()
    table = BlackjackTable.objects.select_for_update().get(key=PUBLIC)
    advance(table, now, rng)
    return table


def advance(table, now=None, rng=None) -> bool:
    """Walk the table forward to wherever its clock says it should be.

    Returns whether anything moved. Safe to call on a table that is up to date,
    which is the common case — most requests arrive in the middle of a window
    and this does nothing at all — and safe to call on one that has been left
    alone for a week, which is the case worth designing for.

    The seats are not locked individually. Everything that touches them takes
    the table's row lock first, so they are already serialised, and locking eight
    more rows in every poll would buy nothing but contention.
    """
    now = now or timezone.now()
    moved = False

    for _ in range(CATCH_UP_LIMIT):
        if now < table.phase_ends_at:
            break
        moved = True
        if table.phase == BETTING:
            _close_betting(table, now, rng)
        elif table.phase == PLAYING:
            _close_playing(table)
        else:
            _close_settling(table)
    else:
        # Unreachable in practice; see CATCH_UP_LIMIT. If it ever is reached the
        # answer is a table in a coherent state rather than a table half walked,
        # so the clock is abandoned and a fresh betting window opened.
        _restart(table, BETTING, now)

    if moved:
        table.save(update_fields=TABLE_FIELDS)
    return moved


def _roll(table, phase: str) -> None:
    """Open `phase`, its window starting where the last one ended.

    Adding to the old end rather than to the wall clock is what keeps the table
    on schedule: a request that arrives two seconds after a window should have
    closed advances it and gets a window that is two seconds in, not one that
    has just started, and eight clients polling at slightly different moments
    all see the same countdown.
    """
    table.phase = phase
    table.phase_ends_at = table.phase_ends_at + timedelta(seconds=PHASE_SECONDS[phase])


def _restart(table, phase: str, now) -> None:
    """Open `phase` starting now, abandoning a schedule nobody was keeping.

    Two callers, and both of them are cases where the old schedule has stopped
    meaning anything. An empty table restarts rather than rolling, which is what
    makes the catch-up walk terminate: without it a table left alone overnight
    would be walked forward one twelve-second window at a time by whoever opened
    it in the morning. And a playing window closed early — see `act` — has no
    old end worth adding to, since the whole point is that the round finished
    before the clock said it would; rolling there would leave the dealer's cards
    on screen for the seconds the players saved plus six.
    """
    table.phase = phase
    table.phase_ends_at = now + timedelta(seconds=PHASE_SECONDS[phase])


def _seats_of(table):
    return list(table.seats.select_related("user").all())


def _close_betting(table, now, rng) -> None:
    """Bets are in. Deal a round if there is one to deal, or wait again."""
    seats = _seats_of(table)

    for seat in seats:
        # A betting window that closed without a bet from this seat is the
        # observable fact behind "somebody has walked away", and it is counted
        # whether or not the window went on to deal a round. Counting only
        # dealt rounds would let one player hold a seat at an otherwise empty
        # table forever, because a table with nobody betting deals nothing and
        # so would never count anything against them.
        seat.idle_rounds = 0 if seat.bet > 0 else seat.idle_rounds + 1

    staying = [seat for seat in seats if seat.idle_rounds < IDLE_LIMIT]
    for seat in seats:
        if seat.idle_rounds >= IDLE_LIMIT:
            seat.delete()
        else:
            seat.save(update_fields=SEAT_FIELDS)

    bettors = [seat for seat in staying if seat.bet > 0]
    if not bettors:
        # Nothing to deal, so the window simply comes round again. An empty
        # table restarts its clock from now instead, which is the only thing
        # standing between this loop and a table that was left alone for a week.
        if staying:
            _roll(table, BETTING)
        else:
            _restart(table, BETTING, now)
        return

    _deal(table, bettors, rng)


def _deal(table, seats, rng) -> None:
    """One card to each seat, one to the house face down, again, and the peek.

    In the order a real table deals it — round the seats, the house's hole card,
    round the seats again, the house's up card last — because that is the order
    a stacked deck in a test should read in, and because it decides which cards
    off the shoe end up where.
    """
    table.round_number += 1
    table.deck = fresh_shoe(rng)

    for seat in seats:
        seat.hands = [blackjack.new_hand([blackjack.draw(table.deck)], seat.bet)]
        # Last round's result, cleared as this one's cards land rather than left
        # to be cleared later: a seat showing +50 next to two fresh cards is
        # saying something that is no longer true.
        seat.net = 0
    # The house's own first card is the one that goes face down. Dealt here,
    # between the two rounds of player cards, because that is when it leaves the
    # shoe at a real table — one card to everybody, one to the house face down,
    # a second to everybody, and the house's up card last of all.
    #
    # Stored the other way round: `dealer[0]` is the up card and `dealer[1]` is
    # the hole card, which is what every reader of this list already assumes and
    # what _dealer_payload hides. Which card came off the shoe first and which
    # one the table may see are two different questions.
    hole = blackjack.draw(table.deck)
    for seat in seats:
        seat.hands[0]["cards"].append(blackjack.draw(table.deck))
    table.dealer = [blackjack.draw(table.deck), hole]

    for seat in seats:
        if blackjack.is_blackjack(seat.hands[0]["cards"]):
            seat.hands[0]["status"] = blackjack.BLACKJACK

    # The peek. A dealer blackjack ends the round before anybody acts — that is
    # the solo game's rule too, and it is what stops a player doubling into a
    # hand that was lost before they touched it.
    if blackjack.is_blackjack(table.dealer):
        table.turn = None
        _settle(table, seats)
        _roll(table, SETTLING)
        return

    for seat in seats:
        seat.save(update_fields=SEAT_FIELDS)
    # First base, and away. _open_turn settles the round itself if it turns out
    # there is nobody to ask — a table where every seat was dealt a natural.
    _open_turn(table, seats, None)


def _close_playing(table) -> None:
    """A turn ran out. That seat stands on what it has, and the turn moves on.

    Standing is what the shared window used to do to everybody at once when it
    shut, and it is the only defensible answer: the cards are the cards, and a
    player who is not there does not get to have drawn to them later.
    """
    seats = _seats_of(table)
    seat = next((one for one in seats if one.seat == table.turn), None)
    if seat is not None:
        for hand in seat.hands:
            if hand.get("status") == blackjack.PLAYING:
                hand["status"] = blackjack.STOOD
        seat.save(update_fields=SEAT_FIELDS)
    _open_turn(table, seats, table.turn)


def _play_plan(table, seat) -> bool:
    """Play this seat's pre-decided move, if it still has one that is legal.

    Returns whether anything was played. The plan is spent whether or not it
    could be used — it was a decision about one moment, and a player whose
    planned double is refused for want of coins is owed the chance to choose
    again rather than a second silent attempt at the same thing.

    Legality is asked of blackjack.actions_for now, against the hand as it
    actually is, exactly as `act` does with a move a client has just sent. A
    plan is a move that arrives early, not a move that arrives trusted.
    """
    plan, seat.planned = seat.planned, ""
    index = active_hand(seat.hands)
    played = False
    if plan and index is not None and blackjack.actions_for(seat.hands, index, index)[plan]:
        played = MOVES[plan](table, seat, seat.hands[index]) is None
    seat.save(update_fields=SEAT_FIELDS)
    return played


def _open_turn(table, seats, after, now=None) -> None:
    """Pass the turn along until it reaches somebody who has to be asked.

    The loop is what pre-deciding buys: a seat that has already chosen plays the
    moment the turn arrives and hands it straight on, so a table where everybody
    planned resolves in one request instead of eight turns of clock. A seat that
    planned a Hit and survived it keeps the turn — it has a new decision now,
    which is not one it made in advance.

    `now` says the previous window ended early: settling and the next turn then
    start from here rather than from a schedule the table has already overtaken.
    See _restart.
    """
    open_window = (lambda phase: _roll(table, phase)) if now is None else (
        lambda phase: _restart(table, phase, now)
    )

    while True:
        nxt = turn_after(seats, after)
        if nxt is None:
            table.turn = None
            _settle(table, [seat for seat in seats if seat.hands])
            open_window(SETTLING)
            return

        seat = next(one for one in seats if one.seat == nxt)
        if not _play_plan(table, seat) or active_hand(seat.hands) is not None:
            table.turn = nxt
            open_window(PLAYING)
            return
        after = nxt


def _settle(table, seats) -> None:
    """The dealer draws once, and every hand at the table is paid against it.

    This is the whole reason the table exists, so it is worth being explicit
    about: the hands of all eight seats are flattened into one list and handed
    to blackjack.settle in a single call. Not because it is shorter, but because
    it makes it structurally impossible for two seats to be settled against
    different dealer hands — there is one call, one dealer, one answer, and the
    dicts in that list are the very dicts stored on the seats.
    """
    for seat in seats:
        for hand in seat.hands:
            if hand.get("status") == blackjack.PLAYING:
                # Nobody acted on it before the window shut, so it stands on
                # what it has. Exactly what standing means everywhere else: the
                # cards are the cards, and the hand takes its chances with them.
                hand["status"] = blackjack.STOOD

    hands = [hand for seat in seats for hand in seat.hands]
    if blackjack.dealer_must_play(hands):
        blackjack.play_dealer(table.dealer, table.deck)

    for hand, result in zip(hands, blackjack.settle(hands, table.dealer)):
        hand["outcome"] = result["outcome"]
        hand["returned"] = result["returned"]

    for seat in seats:
        seat.net = (
            sum(hand["returned"] for hand in seat.hands)
            - sum(hand["stake"] for hand in seat.hands)
        )
        _pay(table, seat)
        seat.save(update_fields=SEAT_FIELDS)


def _pay(table, seat) -> int:
    """Grant what this seat's hands returned. Safe to attempt twice.

    Nothing at all for a seat that lost, which is ordinary: there is no ledger
    row for coins that never moved, and the seat says so with its net.
    """
    total = sum(hand["returned"] for hand in seat.hands)
    if total <= 0:
        return 0
    memo = seat_memo(table, seat.seat)
    if CoinLedger.objects.filter(reason="payout", memo=memo).exists():
        return 0
    grant(seat.user, total, "payout", memo=memo)
    return total


def _close_settling(table) -> None:
    """Cards away. The seats keep their places and lose everything else."""
    for seat in _seats_of(table):
        seat.bet = 0
        seat.hands = []
        seat.net = 0
        # A plan made about last round's cards must not be played against this
        # round's. Most are spent as they are played; this catches the ones
        # belonging to a seat the turn never reached.
        seat.planned = ""
        seat.save(update_fields=SEAT_FIELDS)
    table.deck = []
    table.dealer = []
    table.turn = None
    _roll(table, BETTING)


# ---------------------------------------------------------------------------
# The four things a player can do. Each returns the table, or a string saying
# why not — the same shape blackjackbank uses, so that a refusal is an answer
# rather than an exception.
# ---------------------------------------------------------------------------

def seat_of(table, user):
    """This player's seat at this table, or None."""
    return table.seats.filter(user=user).first()


def look(user=None, now=None):
    """The table as it stands, walked up to date and nothing else.

    A read that writes, which is the price of having no worker: the request that
    notices a betting window has closed is the request that deals the round and
    pays the last one out. It is done under the same lock as everything else, so
    a poll arriving mid-deal waits for the deal rather than seeing half of it.
    """
    with transaction.atomic():
        return locked_table(now)


def free_seat(taken) -> int | None:
    """The lowest chair nobody is in, or None at a full table.

    Lowest rather than any, so that a table filling up fills up from one end and
    the players sit together. The number still decides the order they are asked
    in — see turn_after — but it is no longer something anybody picks: you join
    the game and the table puts you somewhere.
    """
    return next((number for number in range(SEATS) if number not in taken), None)


def join(user, now=None):
    """Join the game. The table finds you a chair.

    Choosing a seat was a decision with nothing behind it: the chairs are
    identical, an empty one between two players was a hole in the layout, and
    the only thing the number decides is the order the seats are asked in, which
    is not a thing anybody was picking a chair to get.

    Allowed in any phase — you sit down and wait for the next betting window,
    which is what joining a table in play means everywhere.
    """
    with transaction.atomic():
        table = locked_table(now)
        if seat_of(table, user) is not None:
            return "You are already at this table."

        taken = {seat.seat for seat in table.seats.all()}
        number = free_seat(taken)
        if number is None:
            return "The table is full."

        try:
            # In its own block so that a refused seat leaves the transaction
            # usable: an IntegrityError poisons the atomic block it happens in,
            # and the walk that advance() just did is in the outer one and must
            # survive. The lock above already serialises two people joining at
            # once; this is the guard for the case a lock cannot cover, and for
            # the day this table is served by two processes on two rows.
            with transaction.atomic():
                BlackjackSeat.objects.create(table=table, user=user, seat=number)
        except IntegrityError:
            return "Somebody got there first — try again."

    return table


def leave(user, now=None):
    """Give up your seat, taking back a bet that has not been dealt to yet.

    Refused while there are cards on the seat. A hand that has been dealt is
    playing for money that is already on the table, and a player who could stand
    up mid-round would be choosing whether to be settled — which is the one
    choice this game must not offer. Twenty-six seconds later it is over and the
    seat is free to leave; a player who has simply closed the tab does not need
    this endpoint at all, because their hand is stood when the window shuts and
    their seat idles out three windows after that.
    """
    with transaction.atomic():
        table = locked_table(now)
        seat = seat_of(table, user)
        if seat is None:
            return "You are not sitting at this table."
        if seat.hands:
            return "You can leave once this round has been settled."

        if seat.bet > 0:
            # Nothing was dealt for it, so it goes back whole. Same memo as the
            # bet itself, so the pair of rows sits together in the ledger and
            # sums to nothing.
            grant(user, seat.bet, "refund", memo=seat_memo(table, seat.seat))
        seat.delete()

    return table


def place_bet(user, amount, now=None):
    """Put coins up for the coming round, on your own seat, once.

    There is no seat on the wire: a bet is placed on the seat the caller is
    sitting in and there is no way to name another one, which is the shape of
    the protection rather than a check somebody could forget to write.

    One bet per round, not topped up. A second bet would have to either replace
    the first — which means refunding coins that have already been taken — or
    add to it, which is a raise, and neither is a thing this table offers.
    """
    with transaction.atomic():
        table = locked_table(now)
        if table.phase != BETTING:
            return "Betting is closed for this round."

        seat = seat_of(table, user)
        if seat is None:
            return "Take a seat first."
        if seat.bet > 0:
            return "You have already bet this round."

        stake = clean_stake(games.BLACKJACK, amount)
        if stake is None:
            return (
                f"A bet is between {games.BLACKJACK.min_stake} "
                f"and {games.BLACKJACK.max_stake} coins."
            )

        # Taken before the bet is written and inside the same transaction as it,
        # so there is never a bet on the table that nobody paid for. A refusal
        # here has moved nothing, so it needs no rollback — which matters,
        # because rolling back would also undo the phase walk above.
        if spend(user, stake, "stake", memo=seat_memo(table, seat.seat)) is None:
            return "Not enough coins."

        seat.bet = stake
        seat.idle_rounds = 0
        seat.save(update_fields=SEAT_FIELDS)

    return table


def _hit(table, seat, hand):
    hand["cards"].append(blackjack.draw(table.deck))
    hand["status"] = blackjack.status_after_card(hand["cards"])


def _stand(table, seat, hand):
    hand["status"] = blackjack.STOOD


def _double(table, seat, hand):
    """Second stake, exactly one card, and the hand is over at whatever it makes."""
    extra = hand["stake"]
    if spend(seat.user, extra, "stake", memo=seat_memo(table, seat.seat)) is None:
        return "Not enough coins to double."
    hand["stake"] += extra
    hand["doubled"] = True
    hand["cards"].append(blackjack.draw(table.deck))
    hand["status"] = blackjack.status_after_card(hand["cards"], one_card_only=True)


def _split(table, seat, hand):
    """Two hands out of a pair, each with its own stake and its own second card.

    Split aces take one card each and then stand, which is enforced by finishing
    them here rather than by refusing a hit later: a hand that cannot be hit
    should not be offered the button in the first place.
    """
    stake = hand["stake"]
    if spend(seat.user, stake, "stake", memo=seat_memo(table, seat.seat)) is None:
        return "Not enough coins to split."

    aces = blackjack.card_rank(hand["cards"][0]) == "A"
    halves = [blackjack.new_hand([card], stake, from_split=True) for card in hand["cards"]]
    for half in halves:
        half["cards"].append(blackjack.draw(table.deck))
        half["status"] = blackjack.status_after_card(half["cards"], one_card_only=aces)
    seat.hands = halves


# The four moves, each doing only the part that differs. The rules they obey are
# blackjack.py's and the shape is blackjackbank._act's; what is not shared with
# the solo game is that the deck belongs to the table rather than to the round.
MOVES = {"hit": _hit, "stand": _stand, "double": _double, "split": _split}


def act(user, action, now=None):
    """Play your own hand, during the playing window, if the rules allow it.

    The client's opinion about which buttons it drew is not consulted. This asks
    blackjack.actions_for — the same function that built the `can` object the
    client was served — again, now, against the hand as it actually is.
    """
    action = str(action or "")
    if action not in MOVES:
        return "That is not a move."

    with transaction.atomic():
        table = locked_table(now)
        if table.phase != PLAYING:
            return "There is nothing to play right now."

        seat = seat_of(table, user)
        if seat is None:
            return "You are not sitting at this table."
        if not seat.hands:
            return "You are not in this round."
        if seat.seat != table.turn:
            # Not a rudeness check: acting out of turn would draw a card that
            # belongs to somebody else's hand, since there is one shoe and the
            # order it comes off in is the order the seats are asked.
            return "It is not your turn."

        index = active_hand(seat.hands)
        if index is None:
            return "You have nothing left to decide."
        if not blackjack.actions_for(seat.hands, index, index)[action]:
            return f"You cannot {action} that hand."

        refusal = MOVES[action](table, seat, seat.hands[index])
        if refusal is not None:
            return refusal

        seat.save(update_fields=SEAT_FIELDS)

        # Done with this seat, so the turn moves along — and if there is nobody
        # after it, the round is over and the dealer turns over. A turn that
        # waited out its clock after its seat had finished would be a table
        # watching a countdown for a card whose value is already fixed.
        #
        # Read the seats back rather than trusting the one in hand: passing the
        # turn is a question about all eight, and this request only touched one.
        # The save above is what puts this seat's move into that answer.
        if active_hand(seat.hands) is None:
            _open_turn(table, _seats_of(table), seat.seat, now or timezone.now())

        # The deck moved, and it lives on the table rather than on the seat.
        table.save(update_fields=TABLE_FIELDS)

    return table


def plan(user, action, now=None):
    """Choose a move for a turn that has not arrived yet. Returns the table.

    Deliberately not validated against the cards. What is legal changes between
    now and the moment the turn lands — a hand that can be split now may have
    been split already by then — so the only thing checked here is that this is
    a move at all, and _play_plan asks the real question when the time comes.
    An empty action clears the plan, which is how a player changes their mind.

    Refused once the turn is yours: at that point the buttons do the thing
    rather than promise it, and a plan sitting behind a live decision is two
    answers to one question.
    """
    action = str(action or "")
    if action and action not in MOVES:
        return "That is not a move."

    with transaction.atomic():
        table = locked_table(now)
        seat = seat_of(table, user)
        if seat is None:
            return "You are not sitting at this table."
        if table.phase == PLAYING and seat.seat == table.turn:
            return "It is your turn — just play it."
        seat.planned = action
        seat.save(update_fields=SEAT_FIELDS)

    return table


def balance_of(user) -> int:
    """This player's coins, opening a wallet for them if they are new."""
    return wallet_for(user).balance


__all__ = [
    "BETTING", "PLAYING", "SETTLING", "SEATS", "PHASE_SECONDS", "IDLE_LIMIT",
    "advance", "act", "join", "leave", "look", "place_bet", "public_table",
    "seat_of", "free_seat",
    "seat_memo", "seconds_left", "phase_after", "active_hand",
    "turn_after", "plan",
]
