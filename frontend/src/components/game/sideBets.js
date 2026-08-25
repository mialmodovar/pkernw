/**
 * What the side-bet card should be saying, worked out away from the drawing.
 *
 * There are only four things it can be doing — taking your call, holding the
 * one you made, reading out how they went, or staying out of the way — and
 * which one it is depends on five bits of table state at once. That is the sort
 * of condition that is wrong for a month in a JSX expression and obvious in a
 * test.
 */

/** Everybody still contesting the pot: the list you may pick from. */
export function contenders(players) {
  return players.filter((p) => (
    !p.is_folded && !p.is_eliminated && !p.is_sitting_out
  ));
}

/**
 * Whether you are watching this hand rather than playing it.
 *
 * Folded, sitting it out, never dealt in, or with no seat at this table at all
 * — the ways to be at the table with nothing riding on the pot, which is
 * exactly who may call it. A spectator has no seat, so they land here too:
 * that is the whole of what lets somebody on the rail call a hand.
 */
export function isOnTheRail(players, mySeat) {
  const mine = players.find((p) => p.seat === mySeat);
  return !mine || Boolean(mine.is_folded) || Boolean(mine.is_sitting_out);
}

/**
 * `mode` is what to draw:
 *   "results" — how the last hand's calls went. Shown to the whole table.
 *   "picking" — the list of players you may back.
 *   "waiting" — the call you already made, while the hand plays out.
 *   null      — nothing worth a corner of the felt.
 *
 * Results win over everything: once the pot is pushed, what somebody called is
 * more interesting than what they might call next, and the next hand clears it.
 */
export function sideBetState({
  players = [],
  mySeat = null,
  open = false,
  bets = [],
  results = null,
  myUserId = null,
}) {
  if (results?.length) {
    return { mode: "results", results, contenders: [], myBet: null };
  }
  const myBet = bets.find((bet) => bet.user_id === myUserId) || null;
  if (myBet) return { mode: "waiting", results: null, contenders: [], myBet };

  const live = contenders(players);
  // Two or more, or there is no question left to have an opinion about.
  if (open && live.length > 1 && isOnTheRail(players, mySeat)) {
    return { mode: "picking", results: null, contenders: live, myBet: null };
  }

  return { mode: null, results: null, contenders: [], myBet: null };
}

/**
 * The stakes offered, which depend on what is in the wallet.
 *
 * A row of buttons rather than a slider: this is a decision taken mid-hand with
 * one hand on the mouse, and three numbers you can hit are worth more than
 * every number between them.
 */
export function stakeChoices(balance, { min = 5, max = 500 } = {}) {
  const purse = Math.max(0, balance ?? 0);
  return [min, 25, 50, 100, 250, max]
    .filter((stake, index, all) => all.indexOf(stake) === index)
    .filter((stake) => stake >= min && stake <= max && stake <= purse);
}

/** "3 of 7 called" — a record, in the one phrase that says what it is. */
export function recordLabel(record) {
  if (!record?.called) return null;
  return `${record.right} of ${record.called} called`;
}

/** Which folded players are on a given seat, for the badge on that seat. */
export function backersOf(bets, seat) {
  return bets.filter((bet) => bet.on_seat === seat);
}
