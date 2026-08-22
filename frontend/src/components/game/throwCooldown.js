/**
 * Whether the arm is still tired.
 *
 * The rule is the server's (game/throwlimit.py): three in a row, then ten
 * seconds. This is only the countdown on the button, so that a player who has
 * spent their burst is told rather than left pressing something that has
 * quietly stopped working.
 *
 * Pure, and separate from the tick that drives it, because the interesting part
 * is the rounding: a wait shown as "0s" for the last nine hundred milliseconds
 * reads as a broken button, which is the exact impression the countdown exists
 * to avoid.
 */

/** Seconds left, rounded up, or 0 when the throw is available. */
export function cooldownLeft(readyAt, now) {
  const ms = (readyAt || 0) - now;
  return ms <= 0 ? 0 : Math.ceil(ms / 1000);
}

/** What the button says while it waits. */
export function cooldownLabel(seconds) {
  return seconds > 0 ? `${seconds}s` : null;
}

/**
 * How long to wait before looking again.
 *
 * Aligned to the next whole second rather than a fixed interval, so the number
 * changes when it is due to change instead of up to a second late.
 */
export function nextTickMs(readyAt, now) {
  const ms = (readyAt || 0) - now;
  if (ms <= 0) return null;
  return ms % 1000 || 1000;
}
