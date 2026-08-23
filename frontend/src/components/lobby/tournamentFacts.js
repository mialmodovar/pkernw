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
export function tournamentFacts(tournament, {
  startTime = null,
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

  return [
    startTime && !finished && !running ? startTime : null,
    elapsed ? (finished ? `took ${elapsed}` : `${elapsed} in`) : null,
    `${t.player_count ?? 0}/${t.max_players ?? 0}`,
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
