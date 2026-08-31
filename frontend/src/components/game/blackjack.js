/**
 * What the blackjack screen says, and which of its buttons do anything.
 *
 * All of this module is formatting and offering. None of it decides what is
 * true about a hand. The server deals, counts and settles, and the round it
 * sends back is the only account of the game anybody is actually paid out of —
 * so the totals here are read off the payload rather than added up from the
 * cards, and the buttons come from the server's own `can` rather than from the
 * house rules restated in JavaScript. A client that quietly disagreed about a
 * soft 17 would not change what the hand was worth; it would just tell somebody
 * they had won while their balance said otherwise, which is the one bug in a
 * game like this that costs real coins and all of somebody's trust.
 *
 * Pure, and tested, for the same reason the tier rows are: every line of it is
 * about money — what a bet costs, whether the wallet covers it, what a finished
 * hand paid — and those are exactly the sentences that sit wrong inside JSX for
 * a month and are obvious in a test.
 */

// The house limits, for a screen drawn before the wallet's game list has
// arrived. They are the same numbers the server enforces (sidegames/games.py);
// the point of the fallback is only that the betting screen can be drawn at
// all, not that the client gets an opinion about the limits.
const FALLBACK_MIN = 5;
const FALLBACK_MAX = 500;

/** Coins the way the rest of the app prints them: figures, with separators. */
const coins = (amount) => Number(amount || 0).toLocaleString();

/** The card the dealer has not turned over yet, as the engine writes it. */
export const HIDDEN_CARD = "??";

/**
 * The chips a bet is built from, smallest first — the order they sit in as a
 * row of buttons under the felt.
 *
 * Three denominations, not the table's seven: stakes here run 5 to 500 and
 * every one of them is a small handful of these. More chips would be more to
 * read and no bet you could not already make.
 */
export const CHIPS = [5, 25, 100];

/**
 * An amount as the pile of chips that makes it, largest first.
 *
 * Greedy, which for 5/25/100 is also exact — every multiple of five up to the
 * table maximum comes out in the fewest chips there are. Largest first because
 * that is the order a pile is built in front of a player: the hundred goes down
 * and the change goes on top, and a pile stacked the other way up reads as
 * somebody else's bet.
 *
 * Never returns a denomination the table does not have, so whatever is left of
 * an odd amount is simply not drawn. The figure is printed beside the pile
 * anyway, and inventing a chip to cover the remainder would be the drawing
 * telling a small lie about what is on the felt.
 */
export function chipsFor(amount) {
  const wanted = Number(amount);
  if (!Number.isFinite(wanted) || wanted <= 0) return [];

  const pile = [];
  let left = Math.floor(wanted);
  for (const chip of [...CHIPS].reverse()) {
    while (left >= chip) {
      pile.push(chip);
      left -= chip;
    }
  }
  return pile;
}

/**
 * The stakes this table takes, as {min, max}.
 *
 * Reads both spellings on purpose. The wallet sends `min_stake`/`max_stake`
 * with each game, and a caller with limits of its own says `min`/`max`; a
 * helper that understood only one of them would silently hand back the
 * fallbacks for a game row it was given in good faith, which is a bet quietly
 * measured against the wrong table.
 */
export function stakeLimits(limits) {
  return {
    min: Number(limits?.min ?? limits?.min_stake ?? FALLBACK_MIN),
    max: Number(limits?.max ?? limits?.max_stake ?? FALLBACK_MAX),
  };
}

/**
 * Whether an opening bet is one this table and this wallet will take.
 *
 * Only the opening bet. A double or a split takes a *second* stake off the
 * wallet (see the contract: a 500 split costs 1,000 in all), so a bet that
 * passes here is still no promise that the hand can be doubled — that question
 * is canCoverSecondStake, and the two are separate because they are asked at
 * different moments about different money.
 */
export function canAfford(amount, balance, limits = {}) {
  const { min, max } = stakeLimits(limits);
  const bet = Number(amount);
  if (!Number.isFinite(bet) || bet < min || bet > max) return false;
  return bet <= Math.max(0, Number(balance) || 0);
}

/**
 * Whether the wallet still holds a second stake for this hand.
 *
 * Doubling and splitting are not free moves, and the player most likely to
 * reach for them is the one who just pushed everything they had into the
 * opening bet. The server refuses it anyway, but a button that lights up and
 * then errors costs somebody the hand they were in the middle of playing.
 *
 * Measured against the hand rather than the round because a doubled hand
 * reports the doubled stake, and it is the hand in front of the player that the
 * next stake is being paid for.
 */
export function canCoverSecondStake(hand, balance) {
  const stake = Number(hand?.stake) || 0;
  if (stake <= 0) return false;
  return Math.max(0, Number(balance) || 0) >= stake;
}

/**
 * What the betting screen says and offers, before there are any cards.
 *
 * `game` is the row out of the wallet's game list, which carries the limits;
 * it is often not there yet on the first paint, so the house numbers stand in.
 *
 * When Deal is off it says why, and the order the reasons are checked in is the
 * point of the function. The table maximum is a fact about the bet and is true
 * for everybody, so it is answered first: telling a player they are short of
 * coins for a bet this table would refuse from anyone sends them to the shop
 * for nothing. A bet of zero is not a mistake and is not told off for being
 * one: nobody has done anything yet, so the reason is the instruction — and
 * `reason` is what the dead Deal button says on its face, so it has to read as
 * a sentence somebody would put on a button rather than as a complaint.
 */
export function bettingState({ bet = 0, balance = null, game = null } = {}) {
  const { min, max } = stakeLimits(game);
  const purse = Math.max(0, Number(balance) || 0);
  const amount = Math.max(0, Math.floor(Number(bet) || 0));

  let reason = null;
  if (amount === 0) reason = "Place a bet";
  else if (amount > max) reason = `Table maximum is ${coins(max)}`;
  else if (amount > purse) reason = "Not enough coins";
  else if (amount > 0 && amount < min) reason = `Minimum bet is ${coins(min)}`;

  return {
    bet: amount,
    label: coins(amount),
    chips: chipsFor(amount),
    min,
    max,
    canDeal: reason === null,
    reason,
    canClear: amount > 0,
    // A chip that cannot be added is drawn dead rather than removed: the row of
    // chips is the same row all evening, and one that reshuffles as the bet
    // grows is a row you have to re-read every time you touch it.
    chipButtons: CHIPS.map((value) => ({
      value,
      label: coins(value),
      enabled: amount + value <= max && amount + value <= purse,
    })),
  };
}

/**
 * What to print for a hand's total.
 *
 * A soft hand is genuinely two hands until somebody draws, so it says both
 * readings — "7 / 17" is the whole of why you might hit a seventeen. The low
 * one is the high one minus the ace's ten; that is arithmetic on the server's
 * own number, not a recount of the cards.
 *
 * `total` and `soft` are taken as given. Recomputing them from the cards would
 * be inviting the client to disagree with the hand it is being paid on.
 */
export function handTotal(hand) {
  if (!hand) return "";
  const total = Number(hand.total) || 0;
  if (hand.soft && total >= 11) return `${total - 10} / ${total}`;
  return String(total);
}

/**
 * The short word over a hand, or null while it is simply being played.
 *
 * 21 outranks "Stood" because it is the better news and the more useful: a
 * player glancing along two split hands wants to know which one is the good
 * one. It is read off the total rather than the status so that a 21 says so
 * from the moment it happens, whether or not the server has stood it yet.
 */
export function handLabel(hand) {
  if (!hand) return null;
  if (hand.status === "blackjack") return "Blackjack";
  if (hand.status === "bust") return "Bust";
  if (Number(hand.total) === 21) return "21";
  if (hand.status === "stood") return "Stood";
  return null;
}

/**
 * What a settled hand says: how it went, and what it paid.
 *
 * The figure is the hand's own movement — what came back, less what went in —
 * so a blackjack on 25 reads "+37" rather than the 62 that landed in the
 * wallet. What somebody wants to know is what they made, and `returned` on its
 * own overstates it by the stake every time.
 *
 * A push and a loss carry no number. A push moved nothing, and the stake a loss
 * cost is the pile still sitting on the felt in front of them; the round's own
 * line underneath has the net for anybody who wants it in figures.
 */
export function outcomeLine(hand) {
  const outcome = hand?.outcome;
  if (!outcome) return null;

  const won = Number(hand.returned || 0) - Number(hand.stake || 0);
  if (outcome === "blackjack") return `Blackjack · +${coins(won)}`;
  if (outcome === "win") return `Won · +${coins(won)}`;
  if (outcome === "push") return "Push";
  return "Lost";
}

// How each outcome is spoken about after the fact, and the order two of them
// are read out in — the good news first, which is the order anybody tells it.
const PAST = { win: "won", lose: "lost", push: "pushed" };
const TELLING_ORDER = ["win", "lose", "push"];

/**
 * One line for the whole round, for the moment the player is told how it went.
 *
 * Two split hands can come out differently, and this is the line that has to be
 * honest about it: "One won, one lost" over a net of nothing is the truth, and
 * anything that rounded that to "Lost" or to "Won" would be picking a half of
 * the round to report. `tone` is taken from the net rather than from the words,
 * because what the colour is answering is "did that cost me anything" — and for
 * a split that came out both ways the answer really is no.
 */
export function roundSummary(round) {
  if (!round || round.status !== "finished") return null;

  const hands = round.hands || [];
  const net = Number(round.net) || 0;
  let tone = "push";
  if (net > 0) tone = "win";
  else if (net < 0) tone = "lose";

  return {
    headline: headlineFor(hands),
    net,
    netLabel: net === 0 ? null : `${net > 0 ? "+" : ""}${coins(net)}`,
    tone,
  };
}

/**
 * The words for however many hands were played.
 *
 * Two is the most there can ever be — the house does not re-split — so the
 * mixed case is only ever a pair, and it is spoken as a pair rather than as a
 * list of outcomes.
 */
function headlineFor(hands) {
  if (!hands.length) return "Round over";

  if (hands.length === 1) {
    const [hand] = hands;
    if (hand.outcome === "blackjack") return "Blackjack";
    if (hand.outcome === "win") return "Won";
    if (hand.outcome === "push") return "Push";
    // A bust is a loss, but it is the loss the player did to themselves, and
    // saying so is the difference between a result and an account of it.
    if (hand.status === "bust") return "Bust";
    if (hand.outcome === "lose") return "Lost";
    return "Round over";
  }

  // A split cannot be a blackjack (house rule), but a server that ever called
  // one that should not read as a fourth kind of outcome down here.
  const outcomes = hands.map((hand) => (hand.outcome === "blackjack" ? "win" : hand.outcome));
  const kinds = TELLING_ORDER.filter((kind) => outcomes.includes(kind));
  if (!kinds.length) return "Round over";
  if (kinds.length === 1) return `Both hands ${PAST[kinds[0]]}`;
  return `One ${PAST[kinds[0]]}, one ${PAST[kinds[1]]}`;
}

/** The hand being played, or null once the round belongs to the dealer. */
export function activeHand(round) {
  if (!round || round.active == null) return null;
  return (round.hands || [])[round.active] || null;
}

// Fixed, and in this order everywhere: a button that changes position between
// one hand and the next is a button somebody hits by accident, and every one of
// these four spends coins or ends a hand.
const ACTIONS = [
  { key: "hit", label: "Hit" },
  { key: "stand", label: "Stand" },
  { key: "double", label: "Double" },
  { key: "split", label: "Split" },
];

// The two that take another stake out of the wallet.
const SECOND_STAKE = ["double", "split"];

/**
 * The four buttons for the active hand, always all four and always in order.
 *
 * Dead ones stay in place rather than disappearing, so Stand is in the same
 * spot on a hand that cannot be split as on one that can.
 *
 * What is enabled comes from the server's `can` and never from the rules read
 * back off the cards — `can` is the server's word on what is legal, and the
 * client's job is to offer no more than it allows. `balance` is the one thing
 * added on top: the wallet is the client's own knowledge, and a double it
 * cannot pay for is better greyed out here than refused after the click. Leave
 * it out and the wallet is not consulted at all.
 */
export function actionButtons(round, { balance = null } = {}) {
  const hand = activeHand(round);
  const live = Boolean(hand) && round?.status !== "finished";
  const can = hand?.can || {};

  return ACTIONS.map(({ key, label }) => {
    let enabled = live && Boolean(can[key]);
    if (enabled && balance != null && SECOND_STAKE.includes(key)) {
      enabled = canCoverSecondStake(hand, balance);
    }
    return { key, label, enabled };
  });
}

/**
 * What the dealer's side of the table says, as the one line it is drawn as.
 *
 * While the hand is live the total is only of what is face up, and the line has
 * to say so: a "10" that becomes a 20 with no warning reads as the table
 * cheating, where "10 · one card down" is simply the game. The face-up ace
 * keeps both of its readings for the same reason a player's does — it is the
 * card the whole decision turns on.
 *
 * `revealed` is for the beat between the round settling and the hole card
 * actually turning over on screen. The settled total is withheld until then,
 * because the line sits beside the cards and one that announced 21 over a card
 * still face down would give away the only moment in this game worth watching.
 * The face-up total cannot be shown during that beat either: once the round is
 * finished the payload's total is the true one, and working the other out from
 * the cards would be the client counting a hand for itself.
 */
export function dealerLine(round, revealed = true) {
  const dealer = round?.dealer;
  if (!dealer) return "";

  if (round.status !== "finished") return `${handTotal(dealer)} \u00b7 one card down`;
  if (!revealed) return "one card down";

  const total = Number(dealer.total) || 0;
  if (dealer.blackjack) return `${total} \u00b7 Blackjack`;
  if (total > 21) return `${total} \u00b7 Bust`;
  return String(total);
}

/**
 * One hand of the last ten, as a mark on the strip.
 *
 * A letter rather than a word: ten of them have to fit across a phone, and the
 * strip is read as a shape — three reds in a row — before any of it is read as
 * text. The full story goes in the tooltip, where there is room for it.
 *
 * Blackjack gets its own mark rather than counting as a win. It paid 3:2 and it
 * is the best thing that happens in this game; a strip that flattened it into a
 * W would be hiding the only rows anybody wants to point at.
 */
export function historyMark(row) {
  const net = Number(row?.net) || 0;
  const figure = net > 0 ? `+${coins(net)}` : net < 0 ? `-${coins(Math.abs(net))}` : null;
  const MARKS = {
    blackjack: { label: "BJ", tone: "blackjack", word: "Blackjack" },
    win: { label: "W", tone: "win", word: "Won" },
    lose: { label: "L", tone: "lose", word: "Lost" },
    push: { label: "P", tone: "push", word: "Push" },
  };
  const mark = MARKS[row?.result] || MARKS.push;
  return {
    ...mark,
    // "Won · +50", or just "Push": a hand that moved nothing has no figure to
    // give, and "Push · 0" reads as a number somebody should care about.
    title: figure ? `${mark.word} \u00b7 ${figure}` : mark.word,
  };
}

/**
 * Whether the blackjack drawer should be on screen over a poker table.
 *
 * The one rule in this feature that can cost somebody real money, so it is a
 * function rather than a condition buried in a component: poker is the game and
 * blackjack is the waiting, and the moment the table needs you the card game is
 * not on screen. A player who misses a decision at a money table because
 * blackjack was covering it will not open it a second time.
 *
 * Deliberately not "hide it if they are in a hand" or "ask them first". It is
 * their turn or it is not, and nothing is lost by closing: the round lives on
 * the server and is still there when they fold again.
 */
export function drawerVisible({ open = false, isMyTurn = false } = {}) {
  return Boolean(open) && !isMyTurn;
}

/** Whether a card is the dealer's hole card, still face down. */
export function isHiddenCard(card) {
  return card === HIDDEN_CARD;
}
