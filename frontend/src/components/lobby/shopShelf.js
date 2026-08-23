/**
 * The shop, arranged.
 *
 * It was one row per item with a button on the end, which was fine for eight
 * and is a scroll for twenty-five: seventeen near-identical rows, each carrying
 * a price nobody was comparing because they could not see two of them at once.
 *
 * So it is a grid of tiles with one detail line under it. The tiles are for
 * finding a thing; the line is for reading about the one you picked. That also
 * gives the effects somewhere to be described — a bucket of water and a brick
 * do rather different things to the person who catches them, and until now the
 * only way to learn that was to buy one.
 *
 * Pure, because the ordering is a judgement worth pinning: a shelf that
 * reshuffles itself as your balance changes is a shelf you cannot learn.
 */

import { throwableFor } from "../game/throwables";
import { hitFor } from "../game/hitEffects";
import { borderFor } from "../borders";

/** What each kind of landing does, in the few words a shop has room for. */
export const HIT_BLURB = {
  splash: "soaks their screen",
  smear: "smears across it",
  frost: "frosts it over",
  crack: "cracks it, and the table shakes",
  blast: "blanks it for a moment",
  sparkle: "leaves it glittering",
  petals: "scatters over it",
  feathers: "leaves feathers drifting down",
  ink: "inks it black",
  thud: "knocks the table",
  drain: "drains the colour out of it",
};

/**
 * The shelf, in a fixed order: cheapest first, and never reordered by what you
 * happen to be able to afford.
 *
 * Owned items stay exactly where they are rather than moving to the end. The
 * grid is how somebody finds the thing they are looking for, and a thing that
 * moves once you own it is a thing you have to find twice.
 */
export function shelf(items, kind = "throwable") {
  return (items || [])
    .filter((row) => (row.shelf || "throwable") === kind && row.price > 0)
    .map((row) => ({
      ...row,
      look: kind === "border"
        ? { ...(borderFor(row.item) || { label: row.item }), glyph: null }
        : throwableFor(row.item),
    }))
    .sort((a, b) => a.price - b.price || a.look.label.localeCompare(b.look.label));
}

/** The ones nobody has to buy, for the line that says so. */
export function alreadyYours(items) {
  return (items || [])
    .filter((row) => (row.shelf || "throwable") === "throwable" && row.price === 0)
    .map((row) => ({ ...row, look: throwableFor(row.item) }));
}

/** What one item is, in one sentence: name, price, and what it does on landing. */
export function describe(row, balance) {
  if (!row) return null;
  // A ring has nothing to do when it lands: it is worn, and what it says is
  // said all evening rather than for a second and a half.
  if ((row.shelf || "throwable") === "border") {
    return {
      label: row.look.label,
      blurb: "Around your face, everywhere you play",
      price: row.price,
      owned: Boolean(row.owned),
      affordable: (balance ?? 0) >= row.price,
    };
  }

  const effect = hitFor(row.item);
  return {
    label: row.look.label,
    // The cigar lands on nobody: it is smoke crossing the table, and saying it
    // splashes would be a lie the shop tells to fill a line.
    blurb: row.look.smoke
      ? "drifts across the table"
      : HIT_BLURB[effect?.kind] || "lands on them",
    price: row.price,
    owned: Boolean(row.owned),
    affordable: (balance ?? 0) >= row.price,
  };
}

/** How many of the paid ones this player still has to buy. */
export function leftToBuy(items) {
  return (items || []).filter((row) => row.price > 0 && !row.owned).length;
}

/**
 * The shelves, in the order the shop draws them.
 *
 * Throwables first: they are what the shop was, and what somebody opening it
 * from a table is nearly always after. An avatar effect is worn all evening and
 * is chosen once, so it can afford to be the second thing.
 *
 * The key stays `border`: it is the server's word for the shelf and the column
 * these are stored in, and renaming what a thing is called to people is not a
 * reason to rewrite what it is called in a database. What changed is that the
 * ring stopped being only a ring — an effect works on the whole picture, so
 * "border" had become a description of where it used to stop.
 */
export const SHELVES = [
  { key: "throwable", label: "Throw", blurb: "Land it on somebody." },
  { key: "border", label: "Avatar effects", blurb: "How your face looks, everywhere you play." },
];
