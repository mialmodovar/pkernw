/**
 * Which envelopes are still on the board, and which have gone.
 *
 * The pool is cut into envelopes once, and after that the only thing the table
 * was told was how many were left and how big the biggest one still was. Two
 * numbers is enough to know whether it is worth chasing anybody; it is not
 * enough to know what is actually out there, which is the question a mystery
 * bounty tournament is played on.
 *
 * So the list is kept, and the amounts that have been drawn are struck off it.
 * Amounts repeat — three envelopes of twenty-five is an ordinary board — so a
 * draw strikes off one of them rather than all the ones that match.
 *
 * Sorted biggest first and never re-sorted: what is left changes on every
 * knockout, and a list that reorders itself as prizes go is one nobody can read
 * twice.
 */

/**
 * The envelopes as rows to draw: `[{ amount, taken }]`, biggest first.
 *
 * `envelopes` is what the pool was cut into and `drawn` is every amount taken
 * out of it since, in the order it went.
 */
export function envelopeRows(envelopes, drawn) {
  const rows = [...(envelopes || [])]
    .map((amount) => ({ amount: Number(amount) || 0, taken: false }))
    .sort((a, b) => b.amount - a.amount);

  for (const amount of drawn || []) {
    // The first one of that size still standing. Matching every row of the same
    // amount would strike off three envelopes for one knockout.
    const hit = rows.find((row) => !row.taken && row.amount === Number(amount));
    if (hit) hit.taken = true;
  }
  return rows;
}

/** How many are still out there, from the rows themselves. */
export function leftOnTheBoard(rows) {
  return (rows || []).filter((row) => !row.taken).length;
}


/**
 * What has been drawn, worked out from the two lists the server sends.
 *
 * `cut` is every envelope the pool was cut into and `left` is the ones still to
 * be drawn. The difference is what has gone — and it has to be a multiset
 * difference, because envelopes repeat: a board of three twenty-fives with one
 * drawn leaves two, not none.
 *
 * Used on arrival, where a reload has no history of its own to go on. While the
 * table is live each knockout says what it drew, and that is appended instead.
 */
export function drawnFrom(cut, left) {
  const remaining = [...(left || [])].map(Number);
  const gone = [];
  for (const amount of [...(cut || [])].map(Number)) {
    const at = remaining.indexOf(amount);
    if (at === -1) gone.push(amount);
    else remaining.splice(at, 1);
  }
  return gone;
}
