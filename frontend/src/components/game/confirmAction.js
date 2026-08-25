/**
 * Which decisions are worth asking twice about.
 *
 * The keyboard has always armed on the first press and committed on the second,
 * because a stray keystroke should not be able to fold a hand. The mouse never
 * had that: one click, from anywhere in the button, and your stack was in the
 * middle. The buttons are the biggest target on the screen and they change what
 * they mean every few seconds, which is exactly the shape of a control people
 * click before they have finished reading it.
 *
 * So the mouse gets the same two-step, but only where it is worth the friction:
 * a fold and a check cost nothing to undo by pressing again, and confirming
 * every call of 40 chips would train the second click into a reflex and make it
 * worth nothing when it matters. What is left is the handful of clicks a night
 * that put a serious share of a stack in — which is the only kind of misclick
 * anybody remembers.
 *
 * Pure, and tested, because the threshold is the whole feature and a threshold
 * that is wrong is either an annoyance or no protection at all.
 */

/**
 * How much of what you have behind makes a decision a big one.
 *
 * Half. Below that you still have a hand to play after being wrong; at or above
 * it the rest of the night turns on the click. It is deliberately not
 * configurable: a number somebody has to choose is a number nobody chooses, and
 * the setting that matters — whether to ask at all — is the one in Settings.
 */
export const BIG_SHARE = 0.5;

/**
 * The chips this decision actually puts in, beyond what is already out there.
 *
 * `amount` on a raise is a total bet, not an increment — it is what the button
 * says and what the server is sent — so what leaves your stack is that total
 * less whatever of yours is already in front of you this street.
 */
export function chipsCommitted({ action, amount = 0, toCall = 0, myBet = 0 }) {
  if (action === "raise") return Math.max(0, amount - myBet);
  if (action === "call") return Math.max(0, toCall);
  return 0;   // fold and check put nothing in
}

/**
 * Whether this click should arm rather than commit.
 *
 * `stack` is what you have behind — the chips a wrong click actually costs you.
 * A stack of nothing behind means anything at all is everything, which is the
 * one case where a tiny number is still a whole tournament.
 */
export function needsConfirm({
  action,
  amount = 0,
  toCall = 0,
  myBet = 0,
  stack = 0,
  share = BIG_SHARE,
} = {}) {
  const chips = chipsCommitted({ action, amount, toCall, myBet });
  if (chips <= 0) return false;
  if (stack <= 0) return true;
  return chips >= share * stack;
}
