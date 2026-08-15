/**
 * When a card changes everything.
 *
 * During an all-in runout the server sends the equities after each card lands,
 * so comparing one reading with the one before it says exactly what that card
 * did. Most cards do very little. The ones that do not are the moment everybody
 * at the table reacts to, and the table should react with them.
 *
 * Pure, so what counts as a big card is something that can be stated and
 * tested rather than tuned by eye inside a component.
 */

// A card that moves somebody this far has changed the hand.
const BIG_SWING = 25;
// A smaller move still matters when it takes the lead off somebody: going from
// behind to in front is the whole story of a runout, whatever the arithmetic.
const LEAD_CHANGE_SWING = 10;
// Past this, it was not a swing, it was a disaster.
const BRUTAL_SWING = 45;
const BRUTAL_LEAD_CHANGE_SWING = 30;

const leaderOf = (readings) => readings.reduce(
  (best, entry) => (best == null || entry.equity > best.equity ? entry : best),
  null,
);

/**
 * How hard the table should shake — "hard", "soft", or null for not at all.
 *
 * `before` and `after` are all_in_equity payloads: [{seat, equity}, ...].
 * Seats missing from either reading are ignored rather than counted as a swing
 * from zero — a player who folded did not just lose ninety points of equity.
 */
export function equityShake(before, after) {
  if (!Array.isArray(before) || !Array.isArray(after)) return null;
  if (before.length === 0 || after.length === 0) return null;

  const previous = new Map(before.map((entry) => [entry.seat, entry.equity]));
  let swing = 0;
  for (const entry of after) {
    const was = previous.get(entry.seat);
    if (was == null) continue;
    swing = Math.max(swing, Math.abs(entry.equity - was));
  }
  if (swing === 0) return null;

  const leadBefore = leaderOf(before)?.seat;
  const leadAfter = leaderOf(after)?.seat;
  const leadChanged = leadBefore != null && leadAfter != null && leadBefore !== leadAfter;

  if (swing >= BRUTAL_SWING || (leadChanged && swing >= BRUTAL_LEAD_CHANGE_SWING)) return "hard";
  if (swing >= BIG_SWING || (leadChanged && swing >= LEAD_CHANGE_SWING)) return "soft";
  return null;
}
