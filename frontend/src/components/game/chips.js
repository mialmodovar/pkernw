/**
 * What a pile of chips looks like for a given amount.
 *
 * The colours have to say the amount at a glance, and the glance happens at
 * nine pixels — the stack beside a player's bet is 9px across and the one by
 * the pot is 14px, smaller than the text next to them. Everything here is
 * chosen for that size and no other.
 *
 * The old set was seven dark faces with a coloured rim, so at 9px on a dark
 * felt every denomination was the same grey dot with a faint edge, and black
 * and silver were indistinguishable. The face is by far the biggest part of a
 * chip, so the face carries the colour now and the rim is the trim. Black is
 * the one exception, and it gets a bone rim to survive at all.
 */

/**
 * Denominations, largest first.
 *
 * `face` is the middle of the chip, `edge` the side of it seen from slightly
 * above, `trim` the ring and the spots around the rim. `spots` is how many
 * breaks that ring has — a shape cue rather than a colour one, which is what
 * keeps two denominations apart for somebody who cannot tell the red from the
 * green.
 */
export const DENOMINATIONS = [
  { value: 5000, face: "#3fa9c9", edge: "#1f6a80", trim: "#effaff", spots: 8 },  // cyan
  { value: 1000, face: "#d8a92a", edge: "#8a6a14", trim: "#fff6d8", spots: 3 },  // gold
  { value: 500,  face: "#8257c8", edge: "#4b2f7d", trim: "#f0e8ff", spots: 6 },  // violet
  { value: 100,  face: "#26262c", edge: "#101014", trim: "#ded6c6", spots: 4 },  // black
  { value: 25,   face: "#279a5e", edge: "#125c36", trim: "#e6fff1", spots: 3 },  // green
  { value: 5,    face: "#c8342f", edge: "#7d1a17", trim: "#ffe8e6", spots: 6 },  // red
  { value: 1,    face: "#ece5d8", edge: "#9a927f", trim: "#4a453c", spots: 4 },  // bone
];

// A stack never grows past this, however big the bet is. The exact figure is
// always printed beside it, so the stack only has to say roughly this much.
export const MAX_CHIPS = 6;

/**
 * The chips to draw for an amount, biggest denomination first.
 *
 * Greedy, and capped: a pot of 40,000 is six 5,000s rather than a tower. What
 * it is really saying is "the big chips are out", which is the true thing at a
 * glance even though the arithmetic stops short.
 */
export function chipsFor(amount) {
  const chips = [];
  let left = amount;
  for (const denom of DENOMINATIONS) {
    while (left >= denom.value && chips.length < MAX_CHIPS) {
      chips.push(denom);
      left -= denom.value;
    }
    if (chips.length >= MAX_CHIPS) break;
  }
  // Never nothing for a live amount: a bet of half a chip is still a bet.
  if (!chips.length && amount > 0) chips.push(DENOMINATIONS[DENOMINATIONS.length - 1]);
  return chips;
}

/**
 * How a chip is proportioned at a given diameter.
 *
 * All of it scales, which the old chip did not: it had a 1.5px rim whether it
 * was drawn at 9px or 40px, so a small chip was one-sixth rim and a large one
 * was a hairline. The floors are there because a rim below half a pixel is a
 * rim the screen rounds away.
 */
export function chipMetrics(size) {
  return {
    // The ring, as a share of the radius.
    rim: Math.max(1, Math.round(size * 0.16)),
    // The side of the chip, under the face. This is what makes a stack read as
    // objects rather than as a column of rings.
    edge: Math.max(1, Math.round(size * 0.14)),
    // How much of each chip the one above it covers.
    overlap: Math.max(2, Math.round(size * 0.3)),
  };
}

/**
 * The sideways wobble of the chip at a given height in the stack.
 *
 * Deterministic, from the index: a stack that re-rendered with fresh random
 * offsets would twitch every time the bet changed. Real stacks lean; a perfect
 * cylinder looks like a diagram.
 */
export function chipLean(index, size) {
  return [0, 0.06, -0.05, 0.03, -0.07, 0.04][index % 6] * size;
}
