/**
 * A moving picture for the moment you go out.
 *
 * Finishing is the one screen in the app with nothing on it but a number and
 * some buttons, and how a night ended is the part people actually talk about
 * afterwards. Cashing deserves something better than a line of text, and busting
 * on the bubble deserves to be laughed at.
 *
 * Nothing is hardcoded to a particular picture. The terms below are searched at
 * the moment the screen opens, the same way the picker searches for anything
 * else, so what comes up is whatever Giphy has today — and a tournament with no
 * key configured simply shows no GIF rather than a broken box.
 */

import { searchGifs } from "../../api/giphy";

/**
 * What to look for, by how the night ended. Several terms each, so the same
 * player busting twice in a row does not get the same search both times.
 */
const TERMS = {
  won: ["poker winner celebration", "champion celebration", "trophy celebration"],
  cashed: ["celebration dance", "cash money celebration", "happy celebration"],
  busted: ["poker bad beat", "disappointed reaction", "walking away sad"],
};

/** Which of the three this finish was. */
export function outcomeOf({ finishPosition, inTheMoney }) {
  if (finishPosition === 1) return "won";
  return inTheMoney ? "cashed" : "busted";
}

/**
 * Pick without a random number, so the GIF does not change under the player on
 * every re-render — and so two people who finished in different places do not
 * sit looking at the same picture.
 */
export function pickIndex(seed, length) {
  if (length <= 0) return 0;
  // A small integer hash: any two nearby seeds land somewhere unrelated, which
  // matters because the seeds here are consecutive finishing positions.
  const mixed = Math.abs(Math.imul(seed | 0, 2654435761) % 2147483647);
  return mixed % length;
}

/**
 * The id of one GIF for this finish, or null when there is none to be had.
 *
 * `seed` should be something stable about this finish — the tournament and the
 * place — so it survives a reload without turning into a slideshow.
 */
export async function findOutcomeGif({ outcome, seed = 0, signal } = {}) {
  const terms = TERMS[outcome] || TERMS.busted;
  const term = terms[pickIndex(seed, terms.length)];
  const results = await searchGifs(term, { limit: 20, signal });
  if (!results.length) return null;
  return results[pickIndex(seed + 1, results.length)].id;
}
