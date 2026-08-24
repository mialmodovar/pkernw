/**
 * The one line under a tournament's name in the lobby.
 *
 * It had grown to ten facts, three of which were money the card was already
 * showing as figures beside it — "€2.50 to places" and "Mystery €2.50" split a
 * prize pool that has a column of its own, and said in halves what the column
 * says whole. Two more were things the row had already said: the game type,
 * when there is only one game, and "club night" beside a chip with the club's
 * name in it.
 *
 * What is left is what you actually scan a list for: when it starts, how full
 * it is, what shape the tables are, what rules it runs under, how many places
 * pay, and how long you have left to get in.
 *
 * Pure, and out of the card, because "which facts" is a judgement and a
 * judgement is worth a test.
 */

import { isSpinGo } from "./buyIn";
import { countdownLabel } from "./tournamentVitals";

// Only worth the width when a tournament is something other than the game
// everybody assumes. One game exists, so this is empty and the label never
// appears — the moment a second one does, the first stops being the default
// and both of them are worth naming.
export const GAME_LABELS = {};

// What a knockout night is called. The word is a rule and belongs here; what
// the heads are worth is money, and money is the figures column's business.
export const BOUNTY_LABELS = { progressive: "PKO", mystery: "Mystery", fixed: "KO" };

/**
 * The facts, in the order they are read.
 *
 * `startTime` and `elapsed` are the caller's, since both are clocks and this
 * file has no business knowing what timezone anybody is in. `hasPoolFigure` is
 * whether the card is showing the prize pool in its own column: when it is,
 * saying it again in words is repetition, and when it is not — a free game —
 * this line is the only place it can be said at all.
 */
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
 * How many have registered.
 *
 * The count, not the count over the cap. "1/100" reads as a room that is
 * one per cent full — which is a fact about a number the host typed once and
 * not about the night: a hundred is the most that could ever sit down, and it
 * has nothing to do with whether this is a game worth joining.
 */
export function registeredLabel(count) {
  const players = Math.max(0, Number(count) || 0);
  return `${players} registered`;
}

export function tournamentFacts(tournament, {
  startTime = null,
  startsInSeconds = null,
  elapsed = null,
  lateRegSeconds = null,
  hasPoolFigure = false,
  prizeLabel = null,
} = {}) {
  const t = tournament || {};
  const finished = t.status === "finished";
  const running = t.status === "running" || t.status === "paused";
  const spinGo = isSpinGo(t);
  const bounty = (t.bounty_mode || "none") !== "none" && (t.bounty_cents || 0) > 0;

  const waiting = !finished && !running;
  const countdown = waiting ? startsIn(startsInSeconds) : null;

  return [
    // How long until it starts, where that is the near answer, and the clock
    // time where it is not.
    countdown || (startTime && waiting ? startTime : null),
    elapsed ? (finished ? `took ${elapsed}` : `${elapsed} in`) : null,
    registeredLabel(t.player_count),
    // 8-max and 9-max play differently enough that it belongs next to the
    // turnout rather than buried in the setup screen.
    t.players_per_table ? `${t.players_per_table}-max` : null,
    spinGo ? "Spin n Go" : null,
    spinGo && t.spin_multiplier ? `${t.spin_multiplier}×` : null,
    spinGo ? null : GAME_LABELS[t.game_type] || null,
    // Which league it counts for. Not "club night": the club's own chip is
    // directly above this line with its name in it, and a night that counts
    // for nothing has nothing to add.
    t.league_name || null,
    bounty ? (BOUNTY_LABELS[t.bounty_mode] || "KO") : null,
    hasPoolFigure ? null : prizeLabel,
    t.payout_structure?.length > 0 ? `${t.payout_structure.length} paid` : null,
    lateRegLine(t, lateRegSeconds, finished),
  ].filter(Boolean);
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
