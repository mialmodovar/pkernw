/**
 * What a player just did, said on their seat.
 *
 * The chat log along the side is a record; this is the table. "Raise to 1,200"
 * on the seat that raised is how you read a hand from across the felt, and it
 * was the one thing the felt did not say — the chips appeared, the stack moved,
 * and what the player had actually done was a line in a list somewhere else.
 *
 * One lifetime, for every action: it stays until the street closes or that
 * player acts again. What was on the felt when it came round to you is the
 * whole reason these exist, and that includes who gave it up — a street where
 * two players folded early reads differently from one where nobody did, and it
 * used to read the same because the folds had timed themselves out before your
 * turn arrived. A fold keeps the spent tone it already had, so it is legible
 * without competing with the seats still in the hand.
 *
 * Pure, and tested, because the wrong lifetime here is a table that lies about
 * who is still to act.
 */

// Posting is not a decision — it is the price of the seat, and it is already on
// the felt as chips. A pill saying "Posts 100" on the big blind every hand is
// noise where the useful thing is what they did when it came round to them.
const POSTS = new Set(["blind", "ante"]);

/** Whether this action is worth a pill on the seat at all. */
export function isWorthShowing(action) {
  return Boolean(action) && !POSTS.has(action);
}

/**
 * The words on the pill.
 *
 * `format` is the caller's chips-or-blinds formatter, so a seat reads in
 * whichever the player set — the same figure the stack under it is in.
 *
 * All in beats everything else it could be called: somebody who raised their
 * last chip did raise, but "All in" is what the rest of the table needs.
 */
export function actionLabel({ action, amount = 0, allIn = false } = {}, format = String) {
  if (allIn) return "All in";
  switch (action) {
    case "fold": return "Fold";
    case "check": return "Check";
    case "call": return amount > 0 ? `Call ${format(amount)}` : "Call";
    case "bet": return `Bet ${format(amount)}`;
    case "raise": return `Raise to ${format(amount)}`;
    default: return null;
  }
}

/**
 * How loud the pill is.
 *
 * A fold is spent and reads as spent; a check is neutral; putting chips in is
 * the thing anybody at the table is actually watching for, so it carries the
 * accent, and an all in carries the table's gold.
 */
export function actionTone({ action, allIn = false } = {}) {
  if (allIn) return "allin";
  if (action === "fold") return "spent";
  if (action === "check") return "quiet";
  return "chips";
}

/**
 * How long this pill stays up: a number of milliseconds, or null for "until
 * something else clears it".
 *
 * Always null now — folds used to expire on a timer and no longer do. Kept
 * rather than deleted because it is the one place a lifetime could ever differ
 * again, and the panel already asks it the question.
 */
export function actionHoldMs() {
  return null;
}
