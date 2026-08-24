/**
 * The thing in the address bar, and what to do with it.
 *
 * A tournament can be opened by its number or by its name — "/tournament/42"
 * and "/tournament/quinta-feira" are the same night. Every link ever handed out
 * is a number and they all still work; the readable one is what gets shared
 * from here on, and an old one still leads to the right place because the server
 * keeps every address a tournament has ever had.
 *
 * Pure, because "which of the two is this" and "should the bar be corrected" are
 * both one-line judgements that are easy to get subtly wrong and impossible to
 * see afterwards.
 */

/** Whether the address is using the number rather than the name. */
export function isNumericKey(key) {
  return /^\d+$/.test(String(key ?? ""));
}

/** Where to fetch a tournament from, given whichever of the two arrived. */
export function tournamentPath(key) {
  return isNumericKey(key) ? `/tournaments/${key}/` : `/tournaments/by-name/${key}/`;
}

/**
 * The address this tournament should be at, or null to leave the bar alone.
 *
 * Only ever a correction of the name part: somebody who opened the number is
 * left on the number — they may have typed it, and moving them would be a
 * surprise — and somebody who opened a retired name is moved to the current one,
 * which is the whole point of keeping the old ones.
 *
 * `tail` is whatever followed the key: /play, /watch/2, or nothing.
 */
export function canonicalPath({ key, slug, tail = "" }) {
  if (!slug || isNumericKey(key) || key === slug) return null;
  return `/tournament/${slug}${tail}`;
}
