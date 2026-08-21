/**
 * How much of a moment one drawn envelope deserves.
 *
 * A mystery bounty is only worth animating because the amounts differ wildly —
 * and if every draw got the full treatment, the full treatment would stop
 * meaning anything by the third one. So the reveal is scaled to what was
 * actually in the envelope, measured against the pool it came out of.
 *
 * Pure, and tested, because "was that the big one" is the whole feeling the
 * feature is selling and it should not be decided by a number typed twice.
 */

/**
 * What an envelope is worth relative to an ordinary one still on the board.
 *
 * Measured against what is left rather than against the whole pool including
 * itself: "five times what anybody else is going to draw" is the thing a player
 * reacts to, and averaging the big one back in flattens exactly the draws worth
 * shouting about. The last envelope has nothing left to compare against, and is
 * the top prize by definition anyway.
 */
export function relativeSize(envelopeCents, poolLeftCents, envelopesLeft) {
  const amount = Math.max(0, envelopeCents || 0);
  const rest = Math.max(0, poolLeftCents || 0);
  const count = Math.max(0, envelopesLeft || 0);
  if (count <= 0 || rest <= 0) return 1;
  return amount / (rest / count);
}

/**
 * How loud to be about it.
 *
 * `jackpot` is the top envelope in the pool or anything worth several ordinary
 * ones — gold, a pulse, and time to look at it. `big` is a good draw. `plain`
 * is most of them, and gets the same quiet flash a fixed bounty has always got.
 */
export function revealTone(mystery) {
  if (!mystery) return "plain";
  const size = relativeSize(
    mystery.envelope_cents, mystery.pool_left_cents, mystery.envelopes_left,
  );
  if (mystery.is_top_prize || size >= 3) return "jackpot";
  if (size >= 1.6) return "big";
  return "plain";
}

/** How long the reveal holds, in milliseconds. The big ones earn a longer look. */
export function revealMs(tone) {
  return { jackpot: 4200, big: 3000, plain: 2200 }[tone] || 2200;
}

/** What the reveal says over the number. */
export function revealHeadline(tone) {
  return {
    jackpot: "The big one",
    big: "A good one",
    plain: "Mystery bounty",
  }[tone] || "Mystery bounty";
}
