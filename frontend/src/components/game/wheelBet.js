/**
 * Sizing a raise with the wheel, from anywhere at the table.
 *
 * The slider is a four-pixel rail and the field is a small box, and both of
 * them have to be found with the cursor while a clock runs. The wheel is
 * already under your hand, so while the decision is yours it sizes the raise —
 * wherever the pointer happens to be, not only over the control.
 *
 * Pure, because two things here are easy to get wrong and impossible to see in
 * a screenshot: a trackpad's flick is dozens of tiny events rather than one
 * notch, and a "line" of wheel travel is not a pixel. Both are normalised here
 * and tested, so the same flick moves the same number of blinds on a mouse and
 * on a trackpad.
 */

/** How much wheel travel makes one step. Roughly one notch of a mouse wheel. */
export const NOTCH_PX = 40;

/** A line of travel, for the wheels that report lines instead of pixels. */
export const LINE_PX = 16;

/** A page, for the rare wheel that reports pages. */
export const PAGE_PX = 400;

/**
 * The travel in this event, in pixels, whatever unit it arrived in.
 *
 * Positive is downwards, which is how the DOM reports it — the direction is
 * turned around at the point of use, where scrolling up meaning "more" is a
 * decision about the raise rather than about the wheel.
 */
export function wheelTravel({ deltaY = 0, deltaMode = 0 } = {}) {
  if (deltaMode === 1) return deltaY * LINE_PX;
  if (deltaMode === 2) return deltaY * PAGE_PX;
  return deltaY;
}

/**
 * Whole steps out of accumulated travel, and what is left over.
 *
 * The remainder is kept rather than dropped so a slow trackpad drag adds up to
 * a step instead of adding up to nothing at all.
 */
export function takeNotches(travel) {
  const notches = Math.trunc(travel / NOTCH_PX);
  return { notches, rest: travel - notches * NOTCH_PX };
}

/**
 * What one notch is worth, in chips.
 *
 * Half a big blind. Raises are thought in blinds, and half of one is the
 * smallest difference anybody actually means — 2.5bb against 3bb is a decision,
 * 2.51bb is a typo. A whole blind a notch was the first try and it made the
 * common sizings unreachable without going back to the slider.
 *
 * Rounded to whole chips, and never to nothing: a table whose blind is 1 still
 * has to move by something.
 *
 * Where there is no blind to go on — a table still loading its level — it falls
 * back to a twentieth of the range, so the wheel always crosses the slider in
 * about twenty turns rather than doing nothing at all.
 */
export function notchChips(bb, minRaise = 0, maxRaise = 0) {
  if (bb > 0) return Math.max(1, Math.round(bb / 2));
  const span = Math.max(0, maxRaise - minRaise);
  return Math.max(1, Math.round(span / 20));
}

/**
 * Where the wheel leaves the raise: the amount, clamped to what is legal.
 *
 * Up is more. Clamping here rather than at the caller is what makes a flick at
 * the top of the range land exactly on all-in instead of overshooting it and
 * being rejected.
 */
export function nextAmount(current, notches, { step, min, max }) {
  const moved = current - notches * step;
  return Math.min(Math.max(moved, min), max);
}
