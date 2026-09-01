/**
 * The words a lobby row is allowed to use for a clock or a rule.
 *
 * This was once a function that assembled the whole line under a tournament's
 * name — ten facts joined with middots into a `truncate`d paragraph, which is
 * to say into a string that got cut off wherever the column happened to end.
 * That line is gone: a row now has a rail, a capped strip of chips and a column
 * of figures, and which fact goes in which slot is tournamentRow.js's business.
 *
 * What is left here is the vocabulary those slots draw on — how a countdown is
 * worded, what a knockout night is called, and how near "near" is. Pure, and
 * separate from the row, because the wording is reused by the tournament page
 * and the row's layout is not.
 */

import { countdownLabel } from "./tournamentVitals";

// What a knockout night is called. The word is a rule and belongs here; what
// the heads are worth is money, and money is the figures column's business.
export const BOUNTY_LABELS = { progressive: "PKO", mystery: "Mystery", fixed: "KO" };

// How near a start has to be before the clock time stops being the useful
// answer. Tonight's game is "in two hours"; next Friday's is "21:00", and the
// list is grouped by day, so the day is already said above it.
export const SOON_SECONDS = 12 * 60 * 60;

/**
 * How long until it starts, in the words somebody would use.
 *
 * Null when the answer is better given as a time of day — which is anything
 * more than half a day out, and anything with no start time at all.
 */
export function startsIn(seconds) {
  if (seconds == null || seconds > SOON_SECONDS) return null;
  if (seconds <= 30) return "starting now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `in ${hours}h ${String(rest).padStart(2, "0")}m` : `in ${hours}h`;
}

/**
 * How long is left to get in, or which level it closes at.
 *
 * Only while somebody can still act on it. "registration until level 12" was
 * most of the width of a phone to say what "late reg L12" says — and once the
 * clock is running, how long you have is the thing that was actually being
 * asked.
 */
export function lateRegLine(tournament, seconds, finished) {
  const t = tournament || {};
  if (finished || !(t.late_reg_level > 0)) return null;
  if (t.status !== "lobby" && !t.late_registration_open) return null;
  const countdown = countdownLabel(seconds);
  return countdown ? `late reg ${countdown}` : `late reg L${t.late_reg_level}`;
}
