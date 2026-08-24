/**
 * How tall a panel that hangs off something may be.
 *
 * A dropdown in a page can be any height it likes: the page scrolls, so
 * whatever falls past the bottom is still one flick away. A dropdown drawn over
 * a poker table cannot — the table does not scroll, so anything past the bottom
 * of the screen is simply gone. That is how the appearance panel lost its
 * finishers on a phone: they are the last section of a very tall panel, below
 * the fold, on a page with nowhere to go.
 *
 * So the panel is told how much room there actually is beneath its own top edge
 * and scrolls inside that. Pure, because the sum is the whole fix and an
 * off-by-a-margin here is a panel that either clips or overhangs.
 */

// Never squeeze it to a slit: below this a "scrollable" panel is unusable, and
// a small overhang somebody can drag the page for beats three visible rows.
const MIN_HEIGHT = 200;

/**
 * Pixels available between `top` and the bottom of the viewport.
 *
 * `margin` is the breathing room left underneath, so the panel does not sit
 * flush against the edge of the screen — or, on a phone, under the browser's
 * own bottom bar.
 */
export function roomBelow(top, viewportHeight, margin = 12) {
  if (!Number.isFinite(top) || !Number.isFinite(viewportHeight)) return null;
  return Math.max(MIN_HEIGHT, Math.round(viewportHeight - top - margin));
}
