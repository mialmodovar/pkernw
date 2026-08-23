/**
 * What being hit looks like, from the inside.
 *
 * A throw already crossed the table and left a splat where it landed. That is
 * the view from the other seats — but the player it was aimed at is the one the
 * throw is about, and on their screen it did not land on a seat, it landed on
 * *them*. So they get the mess: water runs down the glass, a tomato smears
 * across it, a brick cracks it and a bomb blanks it for a moment.
 *
 * It has to clear itself and it has to stay out of the way. Nothing here takes
 * a click, nothing hides the board for more than a moment, and everything is
 * gone inside a second and a half — a hand is being played underneath it, and
 * an effect that outstays that is not a joke, it is an obstruction.
 *
 * Pure: the kinds, their timings and the little bursts of particle geometry.
 * The component (HitEffect.jsx) only draws what this decides.
 */

import { throwableFor } from "./throwables";

/**
 * How each kind of hit behaves.
 *
 *   ms       how long the whole thing lasts
 *   drips    droplets that run down the screen
 *   flecks   bits that land and fade where they hit
 *   shake    whether the table takes a knock with it
 *   wash     a full-screen tint, as a fraction of opacity
 */
export const HITS = {
  splash: { ms: 1300, drips: 9, flecks: 6, shake: false, wash: 0.16 },
  smear: { ms: 1400, drips: 4, flecks: 10, shake: false, wash: 0.2 },
  frost: { ms: 1400, drips: 0, flecks: 8, shake: false, wash: 0.22 },
  crack: { ms: 900, drips: 0, flecks: 4, shake: true, wash: 0.1 },
  blast: { ms: 800, drips: 0, flecks: 8, shake: true, wash: 0.34 },
  sparkle: { ms: 1200, drips: 0, flecks: 12, shake: false, wash: 0.1 },
  petals: { ms: 1500, drips: 0, flecks: 10, shake: false, wash: 0.06 },
  feathers: { ms: 1600, drips: 0, flecks: 9, shake: false, wash: 0.06 },
  ink: { ms: 1400, drips: 6, flecks: 7, shake: false, wash: 0.3 },
  thud: { ms: 700, drips: 0, flecks: 3, shake: true, wash: 0.08 },
  drain: { ms: 1200, drips: 0, flecks: 5, shake: false, wash: 0.24 },
};

/** The default for anything the client does not have a kind for yet. */
export const FALLBACK = "thud";

/**
 * What this item does when it hits somebody.
 *
 * Null for the cigar, which never lands — and for anything a newer server sends
 * that this client has never heard of, since inventing an effect for it would
 * be guessing at somebody else's joke.
 */
export function hitFor(itemId) {
  const item = throwableFor(itemId);
  if (item?.smoke) return null;
  const kind = item?.hit;
  if (!kind) return null;
  return { kind, tint: item.tint, glyph: item.splat, ...(HITS[kind] || HITS[FALLBACK]) };
}

/**
 * Where the flecks land and how long each takes to fade.
 *
 * Scattered from a seeded number rather than Math.random, so a hit looks the
 * same to everybody watching a replay of it and so the layout does not change
 * on a re-render mid-animation. `seed` is the throw's own id.
 */
export function scatter(count, seed = 1) {
  return Array.from({ length: count }, (_, index) => {
    const n = Math.sin(seed * 97.13 + index * 41.7) * 10000;
    const a = n - Math.floor(n);
    const m = Math.sin(seed * 31.7 + index * 13.9) * 10000;
    const b = m - Math.floor(m);
    return {
      left: Math.round(6 + a * 88),
      top: Math.round(8 + b * 78),
      size: Math.round((0.9 + a * 1.8) * 100) / 100,
      delay: Math.round(b * 260),
      spin: Math.round((a - 0.5) * 90),
    };
  });
}

/**
 * Where the drips start and how far they run.
 *
 * Along the top, because that is where liquid thrown at a screen would be, and
 * down by varying amounts so they do not read as a comb.
 */
export function drips(count, seed = 1) {
  return Array.from({ length: count }, (_, index) => {
    const n = Math.sin(seed * 57.3 + index * 27.1) * 10000;
    const a = n - Math.floor(n);
    return {
      left: Math.round((index + 0.5) * (100 / Math.max(1, count)) + (a - 0.5) * 6),
      run: Math.round(18 + a * 46),
      width: Math.round((2 + a * 4) * 10) / 10,
      delay: Math.round(a * 220),
    };
  });
}
