/**
 * How many people are in the app, said in a header's worth of space.
 *
 * Pure, because the two interesting parts are both judgements rather than
 * markup: what to say before the first answer arrives, and how to say a number
 * that includes the person reading it.
 */

/** How often to ask. Nobody needs this to the second, and it is every client. */
export const POLL_MS = 30000;

/** The number, or null while nothing is known yet. */
export function onlineLabel(count) {
  return count == null ? null : String(count);
}

/**
 * The sentence behind the number, for the tooltip.
 *
 * "1 player online" reads as lonely and is also wrong from the inside — the one
 * player is you — so a room of one says so plainly instead.
 */
export function onlineTitle(count) {
  if (count == null) return "Counting who is here";
  if (count <= 0) return "Nobody else is here right now";
  if (count === 1) return "Just you, for the moment";
  return `${count} players online`;
}

/**
 * Whether the counter is worth drawing at all.
 *
 * Not until the first answer: a header that shows a zero for a second on every
 * page load is a header that says the app is empty every time it opens.
 */
export function worthShowing(count) {
  return count != null && count > 0;
}
