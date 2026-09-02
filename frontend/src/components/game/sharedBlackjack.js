/**
 * What the eight-seat table says, and which of its buttons do anything.
 *
 * The shared table is the solo game with seven other people in it, and almost
 * nothing that differs is a rule — it is drawing. Eight chairs that are each
 * empty, or somebody's, or yours; one clock the whole room is on; a dealer who
 * plays once, for everybody. The rules are the solo game's unchanged, which is
 * why this module is a sibling of blackjack.js and imports from it rather than
 * restating it: a hand's total, its label, what a settled hand paid and what a
 * bet costs are the same sentences at a shared table as they are against the
 * house, and two copies of them would quietly drift apart on the screen where
 * eight people can see both.
 *
 * The rule that governs this file: the server is the authority. This module
 * formats and decides what to OFFER; it never decides what is true about a
 * hand, whose turn it is, or what anything paid. Totals are read off the
 * payload, buttons come from the server's own `can`, a seat's result is the
 * `net` the server settled it for, and the phase is whatever the phase says it
 * is. The table moves on its own clock whether or not anybody is watching, and
 * a client with opinions about that clock would be offering a bet into a window
 * that shut, or a hit on a hand that was stood a second ago — and every one of
 * those is somebody's coins.
 *
 * Pure, and tested, because a seat is the busiest thing on this screen: eight
 * of them, redrawn every second, each of which is at any moment empty, waiting
 * on a bet, playing, sitting the round out, or settled. That is a great deal to
 * get right inside JSX and very little to state in a test. *
 * Named `sharedBlackjack` rather than the obvious `blackjackTable`, because
 * macOS resolves module paths without case and `blackjackTable.js` and
 * `BlackjackTable.jsx` are then the same name. The build picked this file for
 * an import of the solo component and the poker table's drawer stopped having
 * anything to draw.
 */

import {
  actionButtons, bettingState, chipsFor, dealerLine, handLabel, handTotal, historyMark,
  outcomeLine, stakeLimits,
} from "./blackjack";

// Six chairs, drawn before the table has said anything at all. The number is
// the server's (see blackjacktable.SEATS); it is restated here only so the felt
// can be laid out on the first paint instead of popping into existence a poll
// later. Six rather than eight because eight fitted on the row and not on the
// felt — two neighbours who each drew twice had four cards where there was room
// for two.
export const SEAT_COUNT = 6;

// Rounds without a bet before the seat is given up. Restated for exactly one
// purpose — warning somebody who is on their last one. The standing up itself
// happens on the server, and nothing here can save or spend a seat.
const IDLE_LIMIT = 3;

/** Coins the way the rest of the app prints them: figures, with separators. */
const coins = (amount) => Number(amount || 0).toLocaleString();

/** The seat rows, as an array, whatever the payload turned out to be. */
function seatRows(table) {
  return Array.isArray(table?.seats) ? table.seats : [];
}

/** How many chairs this table has — its own count, or the eight it will have. */
function seatTotal(table) {
  return seatRows(table).length || SEAT_COUNT;
}

/**
 * A seat, as the number it is.
 *
 * Takes the row as well as the index because half the callers are already
 * holding one — a component mapping over `seats` has the row in its hand and
 * should not have to remember which of the two this module wanted.
 */
function seatIndex(seat) {
  const index = typeof seat === "number" ? seat : Number(seat?.seat);
  return Number.isInteger(index) ? index : null;
}

/** The payload's row for a seat, found by its own number rather than position. */
function seatRow(table, seat) {
  const index = seatIndex(seat);
  if (index == null) return null;

  const rows = seatRows(table);
  const found = rows.find((row) => row?.seat === index);
  if (found) return found;
  // A payload that numbered its seats implicitly, by position. Only trusted
  // when the row does not name a seat of its own: a row that says it is seat 5
  // is seat 5, and handing it back as seat 3 would put somebody else's cards in
  // front of the wrong player.
  const positional = rows[index];
  return positional && positional.seat == null ? positional : null;
}

/** A seat's hands, as an array, on a table mid-deal or not loaded at all. */
function handsOf(row) {
  return Array.isArray(row?.hands) ? row.hands : [];
}

/**
 * Whole seconds left in this phase, or null when the table has not said.
 *
 * Rounded up, not to nearest. A countdown has one job at the end of it, which
 * is to hit zero at the moment the window shuts; rounding to nearest shows a
 * confident "0s" for the last half second of a betting window that is still
 * taking bets, and somebody who believes it does not place theirs. Rounding up
 * is also the stabler of the two under a 1s poll — the number falls by one each
 * time and never sits still for two polls and then skips two.
 */
export function secondsLeft(table) {
  const left = Number(table?.ends_in);
  if (!Number.isFinite(left)) return null;
  return Math.max(0, Math.ceil(left));
}

/** Whether any cards have actually reached the felt this round. */
function anyCardsOut(table) {
  return seatRows(table).some((row) =>
    handsOf(row).some((hand) => (hand?.cards || []).length > 0));
}

/**
 * What the table says it is doing, as the one heading it is drawn as.
 *
 * The clock is given for the two phases you can do something about — the
 * betting window you have to get a bet into, and the playing window that stands
 * your hand for you when it runs out. Settling has a clock too and does not
 * show it: nothing anybody presses changes what the dealer is about to have,
 * and a number ticking down over a result reads as a deadline for a decision
 * that does not exist.
 *
 * "Dealing" is the beat where the phase has turned over but no cards have
 * landed yet. It is a real state of the payload rather than an animation, and a
 * heading that said "Playing" over an empty felt would be the screen getting
 * ahead of the table.
 *
 * A phase this module does not recognise is treated as a table that has not
 * loaded, because there is nothing truthful to say about it.
 */
/** Whose turn it is, in words. Yours is worth saying differently. */
function turnLine(table) {
  if (myTurn(table)) return "Your turn";
  const player = seatRow(table, table?.turn)?.player;
  if (!player) return "Playing";
  return `${player.display_name || player.username}'s turn`;
}

export function phaseLine(table) {
  const left = secondsLeft(table);
  const clock = left == null ? null : `${left}s`;

  switch (table?.phase) {
    case "betting":
      return { label: "Place your bets", detail: clock };
    case "playing":
      if (!anyCardsOut(table)) return { label: "Dealing", detail: null };
      // Named, because the clock beside it is one seat's rather than the
      // table's now and a bare "Playing" over a countdown would read as
      // everybody's deadline.
      return { label: turnLine(table), detail: clock };
    case "settling":
      return { label: "Dealer plays", detail: null };
    default:
      return { label: "Connecting", detail: null };
  }
}

/**
 * Whether the table is waiting on this client right now.
 *
 * The server decides this — it will refuse a move from anybody else — and every
 * button below narrows against it rather than widening: a client that thought
 * it had the turn and did not would only be drawing buttons that get refused.
 */
export function myTurn(table) {
  const seat = table?.my_seat;
  return table?.phase === "playing" && seat != null && table?.turn === seat;
}

/** The move this seat has already chosen for a turn that has not arrived. */
export function myPlan(table) {
  return mySeat(table)?.planned || null;
}

/**
 * The moves worth choosing before your turn arrives.
 *
 * Stand and Hit only, and deliberately. Those two are legal for any hand still
 * being played, so offering them promises nothing that can turn out to be
 * impossible. Double and Split depend on the cards and on the wallet, and the
 * client does not get to hold an opinion about either — see tableActions. A
 * player who wants one of those is a player who wants to look at their hand,
 * which is what the turn is for.
 */
export const PLAN_MOVES = [
  { key: "stand", label: "Stand" },
  { key: "hit", label: "Hit" },
];

/* ------------------------------------------------------------------------- *
 * What a bet may be, which is now two different questions.
 *
 * The low room runs 5 to 500 and the high room runs 500 to whatever is in your
 * wallet, so the three fixed chips this used to offer — 5, 25, 100 — were three
 * buttons that could not place a legal bet in half the casino.
 * ------------------------------------------------------------------------- */

/**
 * The most this player could actually put up.
 *
 * The room's ceiling where it has one, the wallet where it does not, and the
 * lower of the two where both apply. Null balance means the wallet has not
 * loaded yet, and the answer is then the room's ceiling or nothing.
 */
export function betCeiling(table, balance = null) {
  const { max } = betLimits(table);
  const purse = balance == null ? null : Math.max(0, Math.floor(Number(balance) || 0));
  if (max == null) return purse;
  return purse == null ? max : Math.min(max, purse);
}

/**
 * Three amounts worth a button, for whichever room this is.
 *
 * Multiples of the room's own minimum rather than fixed figures: the low room
 * keeps exactly the 5, 25 and 100 it always had, and the high room gets 500,
 * 2,500 and 10,000 without a second list to keep in step. Anything past what
 * the player can cover is dropped rather than drawn dead — a chip you cannot
 * afford is a button that exists to be refused.
 */
export function betSteps(table, balance = null) {
  const { min } = betLimits(table);
  const ceiling = betCeiling(table, balance);
  return [min, min * 5, min * 20]
    .filter((value) => ceiling == null || value <= ceiling);
}

/**
 * Whether there is anything to pre-decide: a hand of yours still being played,
 * and somebody else being asked about theirs.
 */
export function canPlan(table) {
  return table?.phase === "playing" && !myTurn(table) && myHand(table) != null;
}

/* ------------------------------------------------------------------------- *
 * How long the cards take to arrive.
 *
 * The whole deal lands in one payload — the server deals a round atomically —
 * so everything below is the client pretending to be a pair of hands. It was
 * pretending badly: every seat's cards appeared at the same instant and eighty
 * milliseconds apart, which is not a deal, it is a hand of cards materialising.
 *
 * A real deal goes round the table. So does this one, on the same beat the
 * server used: one card to each player, the house's own face down, a second to
 * each player, and the house's up card last.
 * ------------------------------------------------------------------------- */

// The deal, end to end, however many people are playing. A fixed step would put
// a six-handed table three and a half seconds behind its own first turn; a
// budget keeps it honest at any size and the step shrinks to fit.
export const DEAL_BUDGET_MS = 1800;
export const DEAL_MIN_STEP_MS = 95;
export const DEAL_MAX_STEP_MS = 280;

// The hole card turning at the end of the round, and the house drawing itself
// out afterwards. Twice as slow as the deal and then twice as slow again: this
// is the moment the round is decided and it is the one thing at this table
// worth watching, and it kept going past before anybody had looked up.
export const REVEAL_MS = 840;
export const DRAW_STEP_MS = 960;
// How long the turn itself takes. Mirrors .animate-bj-flip in index.css, and is
// restated here because the first card the house draws must land after the hole
// card has finished turning rather than on top of it — a duration CSS owns and
// this file has to know about.
export const FLIP_MS = 1040;

/** How long between one card and the next, for a table of this many players. */
export function dealStep(seats) {
  const beats = Math.max(1, lastBeat(seats));
  const step = DEAL_BUDGET_MS / beats;
  return Math.round(Math.min(DEAL_MAX_STEP_MS, Math.max(DEAL_MIN_STEP_MS, step)));
}

/** The beat the last card of the deal lands on. */
function lastBeat(seats) {
  return Math.max(1, seats) * 2 + 1;
}

/**
 * Which beat of the deal a card lands on, or null for one that was not dealt.
 *
 * `position` is where in the row the player is rather than their seat number,
 * because only occupied chairs are drawn. `card` is the index within the hand.
 * Null means "this card arrived on its own" — a hit, a split, anything past the
 * opening two — and those have nothing to wait for.
 */
export function dealBeat({ card, position = 0, seats = 1, dealer = false }) {
  const players = Math.max(1, seats);
  if (!Number.isInteger(card) || card < 0) return null;

  if (dealer) {
    // Stored up card first, dealt hole card first: the house's own first card
    // goes face down between the two rounds of player cards and its up card is
    // the last thing off the shoe. See blackjacktable._deal, which is where
    // that order is decided; this only has to agree with it.
    if (card === 0) return lastBeat(players);
    if (card === 1) return players;
    return null;
  }

  if (card === 0) return position;
  if (card === 1) return players + 1 + position;
  return null;
}

/** When a card lands, in milliseconds after the deal began. */
export function dealDelay(spec) {
  const beat = dealBeat(spec);
  return beat == null ? 0 : beat * dealStep(spec.seats ?? 1);
}

/**
 * When one of the house's own draws lands, after the hole card has turned.
 *
 * A separate clock from the deal: these cards appear when the round settles,
 * which is a different moment entirely, and they are drawn one at a time with
 * the whole table watching. Card two is the first of them.
 */
export function drawDelay(card) {
  return REVEAL_MS + FLIP_MS + Math.max(0, card - 2) * DRAW_STEP_MS;
}

// How long a turn is, in seconds. The server's number (blackjacktable
// PHASE_SECONDS), restated here for the same reason SEAT_COUNT is: the bar over
// the seat being asked has to know what a full one looks like, and the payload
// only says how much is left.
export const TURN_SECONDS = 10;

/**
 * How much of the current turn is left, as a percentage.
 *
 * Null when there is no turn running, so the bar is absent rather than empty —
 * a drained clock over a seat nobody is waiting on reads as somebody having run
 * out of time. Clamped both ways: a turn that has overrun its clock without a
 * poll to notice is at zero, not at a negative width.
 */
export function turnPct(table) {
  if (table?.phase !== "playing" || table?.turn == null) return null;
  const left = secondsLeft(table);
  if (left == null) return null;
  return Math.max(0, Math.min(100, (left / TURN_SECONDS) * 100));
}

/** The stakes this table takes, as {min, max}, before its payload has landed. */
export function betLimits(table) {
  const { min, max } = stakeLimits({ min: table?.min_bet, max: table?.max_bet });
  // Null, not a fallback, when the room has no ceiling. stakeLimits fills a
  // missing max with its own default, which is right for a SideGame — every one
  // of those has a ceiling — and wrong for the high room, where the absence IS
  // the rule: it would have quietly capped an unlimited table at the low room's
  // maximum and refused, on the client, bets the server was happy to take.
  // Only once the table has actually answered: a payload that has not arrived
  // is not an unlimited table.
  return { min, max: table && table.max_bet == null ? null : max };
}

/**
 * Your own seat row, or null.
 *
 * `my_seat` is the server's word and the row is the convenience; they are
 * looked up separately on purpose, so a payload whose seats have not been read
 * yet gives back null here rather than somebody else's cards.
 */
export function mySeat(table) {
  if (table?.my_seat == null) return null;
  return seatRow(table, table.my_seat);
}

/**
 * Whether you have a chair at this table.
 *
 * Asked of `my_seat` rather than of the row, because that is the server saying
 * so in one field. A screen that decided from a missing row that you were not
 * seated would offer you a chair you are already sitting in.
 */
export function isSeated(table) {
  return table?.my_seat != null;
}

/** What you have on the felt this round, as a figure. */
export function myBet(table) {
  return Math.max(0, Number(mySeat(table)?.bet) || 0);
}

/**
 * Which hand of yours is the one being asked about.
 *
 * There is no "active" field on a seat — the contract does not have one — so it
 * is found the only two honest ways round: the hand the server is offering
 * something on, and failing that the hand it still calls playing. Both are the
 * server's own account of the seat. A split is the only time there is more than
 * one, and after the first is stood the second is the one with the buttons.
 */
export function myHand(table) {
  const hands = handsOf(mySeat(table));
  const index = actingIndex(hands);
  return index == null ? null : hands[index];
}

/** The hand a seat is on, by what the server offers it or what it calls live. */
function actingIndex(hands) {
  const offered = hands.findIndex((hand) => Object.values(hand?.can || {}).some(Boolean));
  if (offered >= 0) return offered;
  const live = hands.findIndex((hand) => hand?.status === "playing");
  return live >= 0 ? live : null;
}

/** How a seat's round came out, in the one word the strip and the mark use. */
function seatResult(row) {
  const net = Number(row?.net) || 0;
  // Blackjack is only claimed for a seat that was actually paid for one: it is
  // the server's outcome and the server's net, and a seat that somehow has the
  // first without the second is not going to be told it won.
  if (net > 0 && handsOf(row).some((hand) => hand?.outcome === "blackjack")) return "blackjack";
  if (net > 0) return "win";
  if (net < 0) return "lose";
  return "push";
}

/**
 * What a settled seat's line says.
 *
 * One hand is the ordinary case, and the solo screen already has the sentence
 * for it — including which outcomes carry a figure and which do not, which is a
 * decision about somebody's money and not one to make twice.
 *
 * A split seat is two hands and one `net`, and that net is what the seat got.
 * Reporting the halves separately on a chair the size of a thumbnail would be
 * asking the table to add them up; the seat says what it came out with.
 */
function settledLabel(hands, net) {
  if (hands.length === 1) {
    const line = outcomeLine(hands[0]);
    if (line) return line;
  }
  if (net > 0) return `Won · +${coins(net)}`;
  if (net < 0) return "Lost";
  return "Push";
}

/** A live hand's line: the word for it if it has one, otherwise the total. */
const playedLabel = (hand) => handLabel(hand) || handTotal(hand);

/**
 * The one line a seat prints, whatever it happens to be doing.
 *
 * Phase first, then cards. During betting the interesting thing about a seat is
 * the money on it, and a seat still showing last round's twenty because the
 * payload has not cleared it would be a table telling one of its oldest lies.
 */
function labelFor({ empty, phase, bet, hands, net, settled }) {
  if (empty) return "Empty";
  if (phase === "betting") return bet > 0 ? coins(bet) : "Waiting";
  if (settled) return settledLabel(hands, net);
  // Two hands, joined, because a split seat is still one seat: "20 · Bust" is
  // the whole of what that player has and the pair is read as one line.
  if (hands.length) return hands.map(playedLabel).join(" · ");
  return "Sitting out";
}

/**
 * How loud the seat is.
 *
 * A live hand carries the accent because it is the thing still happening; a
 * seat that has stood is done but not yet judged, and only a settled seat gets
 * a colour that says whether it was good news — which comes off the server's
 * net through the same mark the solo history strip uses, so a win is the same
 * green in both places.
 *
 * A bust during play is called a loss before settling says so, because it is
 * one: the seat cannot come back from it and the felt should not pretend the
 * question is open.
 */
function toneFor({ empty, phase, bet, hands, live, settled, mark }) {
  if (empty) return "empty";
  if (phase === "betting") return bet > 0 ? "bet" : "waiting";
  if (settled) return mark.tone;
  if (hands.length) {
    if (live) return "live";
    if (hands.some((hand) => hand?.status === "blackjack")) return "blackjack";
    if (hands.every((hand) => hand?.status === "bust")) return "lose";
    return "done";
  }
  return "out";
}

/**
 * Everything one chair needs drawn, as one object.
 *
 * A seat is the busiest thing on this screen and the component asks it one
 * question rather than eight: it is empty or it is not, it is yours or it is
 * not, it is waiting on a bet, it is playing, and it has a line and a colour.
 * Every one of those used to be a condition in JSX, and the combination of them
 * — a seat of yours that bet, was dealt to, split, busted one and won the other
 * — is exactly the case nobody tests by clicking around.
 *
 * Total in every direction: a seat that does not exist, a table that has not
 * loaded and a payload mid-deal all come back as something drawable.
 */
export function seatState(seat, table) {
  const index = seatIndex(seat);
  const row = seatRow(table, seat);
  const phase = table?.phase || null;

  const player = row?.player || null;
  const empty = !player;
  const hands = handsOf(row);
  const bet = Math.max(0, Number(row?.bet) || 0);
  const net = Number(row?.net) || 0;
  const live = hands.some((hand) => hand?.status === "playing");
  const settled = phase === "settling" && hands.length > 0;
  // The same mark the solo game's history strip draws, which is what makes a
  // settling table readable at a glance: eight letters and eight colours.
  const mark = settled ? historyMark({ result: seatResult(row), net }) : null;

  return {
    seat: index,
    empty,
    mine: index != null && table?.my_seat === index,
    player,
    name: player ? (player.display_name || player.username || "Player") : "",
    waiting: !empty && phase === "betting" && bet <= 0,
    playing: live,
    // The seat the table is actually waiting on, which is not the same as a
    // seat with cards still in play: seven of them can be live at once and only
    // one of them is being asked.
    turn: phase === "playing" && index != null && table?.turn === index,
    inRound: hands.length > 0,
    settled,
    bet,
    chips: chipsFor(bet),
    hands,
    hand: hands[0] || null,
    activeIndex: actingIndex(hands),
    net,
    netLabel: net > 0 ? `+${coins(net)}` : net < 0 ? `-${coins(Math.abs(net))}` : null,
    mark,
    idleRounds: Math.max(0, Number(row?.idle_rounds) || 0),
    label: labelFor({ empty, phase, bet, hands, net, settled }),
    tone: toneFor({ empty, phase, bet, hands, live, settled, mark }),
  };
}

/** Every chair, in seat order — the eight of them before the table loads. */
export function seatStates(table) {
  return Array.from({ length: seatTotal(table) }, (_, index) => seatState(index, table));
}

/**
 * Whether that empty chair can be taken right now, and why not if it cannot.
 *
 * Deliberately not gated on the phase. A table you can only join during a
 * twelve-second window is a table you mostly cannot join, and there is nothing
 * to be lost by sitting mid-round: the seat simply plays from the next one.
 *
 * The wallet is consulted only when it has arrived. The chair itself is free,
 * so an unloaded balance is no reason to refuse it — but a seat you cannot
 * afford to bet from is a seat the server stands you up out of in three rounds,
 * and that is worth saying before somebody takes it rather than after.
 */
export function canJoin(table, balance = null) {
  if (!table) return { allowed: false, reason: "Waiting for the table" };
  if (isSeated(table)) return { allowed: false, reason: "You are already here" };
  if (players(table).length >= seatTotal(table)) {
    return { allowed: false, reason: "The table is full" };
  }

  const { min } = betLimits(table);
  if (balance != null && Number(balance) < min) {
    return { allowed: false, reason: "Not enough coins" };
  }
  return { allowed: true, reason: null };
}

/**
 * The people actually at the table, in the order they are asked.
 *
 * Only the occupied chairs. There is no picking a seat any more, so an empty
 * one is not a thing to offer — it is a gap in a row of people, and the row
 * spreads to fill the felt instead of leaving holes where nobody is.
 */
export function players(table) {
  return seatRows(table).filter((row) => row?.player);
}

/**
 * How much of each card after the first is hidden behind the one before it.
 *
 * Two cards fit side by side at any table size, so they sit side by side. Past
 * that they are fanned, because the seat tile does not grow when a hand does:
 * two players next to each other who each drew twice had four cards where there
 * was room for two, and the tiles ran into one another. A fanned hand is how a
 * hand of cards actually looks in somebody's hand, and it is readable — the
 * rank is centred on the card and the overlap comes off the right of each.
 */
export function cardOverlap(count) {
  if (count <= 2) return 0;
  return count === 3 ? 0.3 : 0.45;
}

/**
 * Whether this bet can go on the felt, and what the dead button says if not.
 *
 * The round's own facts are asked first — the window, the chair, the bet
 * already up — because they are true of any amount, and telling somebody their
 * bet is over the maximum when betting closed a second ago sends them to fix
 * the wrong thing.
 *
 * The amount itself is then handed to the solo screen's own `bettingState`,
 * which already has the order these are checked in and the words they are
 * refused with. That is the point of borrowing it: the two blackjack screens in
 * this app say "Table maximum is 500" in the same voice, and a player who is
 * short of coins is told so the same way whoever they are playing against.
 *
 * One bet per round, because that is what the contract allows: the endpoint
 * takes a bet during `betting` on your own seat, and a seat that already has
 * one is not raising it.
 */
export function canBet(table, amount, balance = null) {
  if (!table) return { allowed: false, reason: "Waiting for the table" };
  if (table.phase !== "betting") return { allowed: false, reason: "Betting is closed" };
  if (!isSeated(table)) return { allowed: false, reason: "Take a seat first" };
  if (myBet(table) > 0) return { allowed: false, reason: "Bet placed" };

  // An unlimited room is measured against the wallet instead, which
  // bettingState already checks — see betLimits for why the ceiling is null.
  const { min, max } = betLimits(table);
  const ceiling = max == null ? Number.MAX_SAFE_INTEGER : max;
  const state = bettingState({ bet: amount, balance, game: { min, max: ceiling } });
  if (!state.canDeal) return { allowed: false, reason: state.reason };
  return { allowed: true, reason: null };
}

/**
 * The four buttons for your own seat, always all four and always in order.
 *
 * Handed straight to the solo screen's `actionButtons` as a one-hand round,
 * which is what your seat is: the hand shape is the same by contract, and
 * borrowing the function is what guarantees the order and the shape stay
 * identical between the two tables rather than being kept identical by hand.
 *
 * Nothing is offered outside `playing`. The server already says so — `can` is
 * false on every action outside the window and on everybody else's seat — and
 * this narrows it again rather than widening it, which is the only direction a
 * client is allowed to move.
 *
 * `balance` is the one thing the client knows that the payload does not: a
 * double it cannot pay for is better greyed out here than refused after the
 * click, in a twenty-second window.
 */
export function tableActions(table, { balance = null } = {}) {
  const hand = table?.phase === "playing" ? myHand(table) : null;
  const round = hand ? { status: "playing", hands: [hand], active: 0 } : null;
  return actionButtons(round, { balance }).map((button) => ({
    ...button,
    note: actionNote(button.key, hand),
  }));
}

/**
 * The half-line under an action, saying what it actually does to this hand.
 *
 * Four one-word buttons assume the reader already plays blackjack. "Stand" and
 * "Double" are jargon, and the two that quietly take a second stake off the
 * wallet look exactly like the two that do not — which is the part worth
 * fixing, because it is the part that costs coins.
 *
 * Written against the hand in front of the player rather than in general: "keep
 * 18" is a sentence about this hand and "keep what you have" is a definition.
 */
export function actionNote(key, hand) {
  const total = hand?.total;
  const stake = hand?.stake;
  switch (key) {
    case "hit":
      return "one more card";
    case "stand":
      return total ? `keep ${total}` : "keep what you have";
    case "double":
      // The number is the point: this is the button that doubles what is at
      // risk, and it is one tap away from the two that do not.
      return stake ? `+${stake} coins, one card` : "double the bet, one card";
    case "split":
      return stake ? `+${stake} coins, two hands` : "two hands";
    default:
      return null;
  }
}

/**
 * The dealer's line, which says nothing it should not.
 *
 * `settling` is this table's word for the round being over, so it is what the
 * solo module's "finished" maps to: before it, the line is the face-up total
 * and the fact that a card is down, and the total the whole table is waiting on
 * simply does not exist on the client yet — the hole card is "??" in the
 * payload until then.
 *
 * `revealed` is the same beat the solo screen has, for a table that turns the
 * card over on screen a moment after the payload settles. Held back the same
 * way, because a line announcing 21 over a card still face down gives away the
 * only moment in this game worth watching, and here it does it for eight people
 * at once.
 */
export function dealerTableLine(table, revealed = true) {
  const dealer = table?.dealer;
  if (!dealer || !(dealer.cards || []).length) return "";
  return dealerLine({ status: table.phase === "settling" ? "finished" : "playing", dealer }, revealed);
}

/**
 * The seats that got a result this round, in seat order.
 *
 * Seat order rather than biggest winner first: the list sits beside a felt that
 * is laid out in seat order, and a leaderboard would make everybody find their
 * own chair twice. Seats that sat the round out are left off entirely — they
 * did not lose, they were not playing, and a row saying "Push" against somebody
 * who never bet is a table inventing a hand.
 */
export function settledSeats(table) {
  if (table?.phase !== "settling") return [];
  return seatStates(table).filter((seat) => seat.settled);
}

/** "3 of 8 seated", for the heading over the felt. */
export function occupancy(table) {
  const seated = seatRows(table).filter((row) => row?.player).length;
  return `${seated} of ${seatTotal(table)} seated`;
}

/**
 * The warning for somebody about to lose their chair, or null.
 *
 * The rule is the server's: three rounds without a bet and the seat is freed.
 * Losing a seat at a full table is not a small thing — it is somebody who
 * looked away for a minute coming back to find they are watching — so the last
 * round before it happens says so, while there is still a window to bet into.
 * Only during betting, because that is the only phase where the sentence is
 * something you can act on.
 */
export function idleWarning(table) {
  if (table?.phase !== "betting") return null;
  const row = mySeat(table);
  if (!row || (Number(row.bet) || 0) > 0) return null;
  if ((Number(row.idle_rounds) || 0) < IDLE_LIMIT - 1) return null;
  return "Bet this round or you lose your seat";
}
