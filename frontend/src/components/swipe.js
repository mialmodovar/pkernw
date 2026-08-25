/** Reading a drag, kept apart from the thing that draws the panel.
 *
 * The whole difficulty of a swipe is that it shares a screen with a scroll: a
 * settings sheet is a tall column somebody drags up and down, and a page turn
 * has to be told from a scroll that wandered sideways. That is a decision about
 * two numbers, which is worth being able to test on its own.
 */

/** Below this it was a tap, or a thumb resting. */
export const SWIPE_MIN_PX = 56;

// How much more sideways than up-and-down a drag has to be before it counts as
// a page turn. A thumb dragging a long list rarely travels straight down, so an
// even contest between the two axes would turn pages by accident.
const SIDEWAYS = 1.5;

/**
 * Which way a finished drag turns the page: 1 forward, -1 back, 0 for neither.
 *
 * Dragging left goes forward, the direction the content moves — the same way a
 * photo album works, and the opposite of what "left means back" would suggest.
 */
export function swipeStep({ dx, dy }) {
  if (Math.abs(dx) < SWIPE_MIN_PX) return 0;
  if (Math.abs(dx) < Math.abs(dy) * SIDEWAYS) return 0;
  return dx < 0 ? 1 : -1;
}

/** A page number that stays inside the pages there are. */
export function clampPage(index, count) {
  if (!count) return 0;
  return Math.min(Math.max(index, 0), count - 1);
}
