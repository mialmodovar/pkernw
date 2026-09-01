/**
 * What one tournament row is allowed to say, and in which of its three slots.
 *
 * The row this replaces was one truncated line of prose. A running club PKO put
 * "1h 42m in · 23 registered · 9-max · Liga de Inverno · PKO · 12 paid · late
 * reg 8:20" into a `<p className="truncate">`, which is white-space:nowrap — so
 * the promised wrapping never happened and the tail was simply cut off. On a
 * 390px phone the cut fell exactly on "late reg 8:20": the row dropped the one
 * fact somebody had to act on within the minute and kept "9-max".
 *
 * The fix is structural rather than editorial. A row has a fixed-width rail for
 * when (rowLead), a capped set of chips for the rules (rowTags), and a column
 * of figures (rowMoney) — so no fact can push another one off the end, and the
 * next fact somebody wants to add has to displace one that is already there
 * rather than quietly lengthening a string.
 *
 * Clocks stay the caller's, for the reason tournamentFacts.js already argues:
 * this file has no business knowing what timezone anybody is in, and a pure
 * function that reads Date.now() is neither pure nor testable.
 */

import { rowEntries, totalPool } from "../game/prizePool";
import { BOUNTY_LABELS, lateRegLine, startsIn } from "./tournamentFacts";

/** "2h 15m" — the way a host says how long something took. */
export function spanBetween(from, to) {
  if (!from) return null;
  const minutes = Math.round((new Date(to || Date.now()) - new Date(from)) / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return "just started";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** "1st", "2nd", "11th" — the teens are the whole reason this is a function. */
export function ordinal(n) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${suffix}`;
}

/**
 * The rail on the left of a row: one short value over one shorter note.
 *
 * Every row answers the same question here — when, or how it went — which is
 * what lets a list of them be read down a column instead of one at a time. It
 * is a fixed width in the layout, so `value` has to stay short: an ordinal, a
 * clock time, or a span like "2h 05m". `note` is the word that makes the value
 * a sentence ("of 23", "in", "to go") and may be null when the value says it
 * on its own.
 *
 * `tone` is a name, not a colour: the row picks the palette, this picks which.
 */
export function rowLead(tournament, { startTime = null, startsInSeconds = null, elapsed = null } = {}) {
  const t = tournament || {};
  const finished = t.status === "finished";
  const running = t.status === "running" || t.status === "paused";

  if (finished) {
    // Where you came, over how many were in it. The old row said "you 7th"
    // buried in the middle of a line; a place is the whole point of a night
    // that is over, so it leads.
    if (t.my_finish_position) {
      return {
        value: ordinal(t.my_finish_position),
        note: `of ${t.player_count}`,
        tone: t.my_finish_position === 1 ? "win" : "past",
      };
    }
    return { value: "—", note: "played", tone: "past" };
  }

  if (running) {
    // How long it has been going. "live" only when the server never stamped a
    // start, which happens on old rows — better than an empty rail.
    return { value: elapsed ?? "live", note: "in", tone: "live" };
  }

  const soon = startsIn(startsInSeconds);
  if (soon) {
    // startsIn writes prose ("in 2h 05m") because it was written for a line of
    // prose. The rail already means "when", so the preposition is width spent
    // on nothing. "starting now" is the one answer that is not a duration, and
    // "starting now to go" is not English — it gets said the other way round.
    if (soon === "starting now") return { value: "now", note: "starting", tone: "soon" };
    return { value: soon.replace(/^in /, ""), note: "to go", tone: "soon" };
  }
  // Far enough out that the clock time is the better answer. The list is
  // grouped by day, so the day is already in the heading above.
  if (startTime) return { value: startTime, note: null, tone: "plain" };

  return { value: "—", note: null, tone: "plain" };
}

/**
 * The rules chips, at most `max` of them, in the order they matter.
 *
 * The cap is the point of this function, not a detail of it. Every fact on the
 * old row was individually defensible and the sum of them was unreadable, so
 * the row now has a fixed number of slots and a stated priority: how long you
 * have to get in beats whether you can get in at all, which beats what kind of
 * game it is, which beats which league it counts for. A fact that cannot win a
 * slot does not appear, and the next fact somebody wants on a row has to argue
 * with the four already here instead of making the row one word longer.
 *
 * League is last on purpose: the club chip beside these carries a trophy and a
 * tooltip that names it, so the chip is a duplicate everywhere the club is
 * known — see TournamentCard, which drops it there.
 */
export function rowTags(tournament, { lateRegSeconds = null, full = false, max = 4 } = {}) {
  const t = tournament || {};
  const finished = t.status === "finished";
  const late = lateRegLine(t, lateRegSeconds, finished);
  const bounty = (t.bounty_mode || "none") !== "none" && (t.bounty_cents || 0) > 0
    ? (BOUNTY_LABELS[t.bounty_mode] || "KO")
    : null;

  return [
    late ? { key: "late", text: late, tone: "urgent" } : null,
    // A full room is why the Join button is not there, which is a question the
    // row was answering with the bare word "full" sitting in among the buttons.
    full && !finished ? { key: "full", text: "full", tone: "muted" } : null,
    bounty ? { key: "bounty", text: bounty, tone: "note" } : null,
    t.league_name ? { key: "league", text: t.league_name, tone: "note" } : null,
  ].filter(Boolean).slice(0, Math.max(0, max));
}

/**
 * The figures column: what it costs, what is in it, and what you took out.
 *
 * `stake` and `pool` are the two numbers a lobby is read for and are unchanged
 * — the same buy-in fields and the same totalPool as before, structured rather
 * than formatted so the row can decide about coin glyphs and locales.
 *
 * `net` is what a finished row should say and cannot yet: what you actually
 * won. TournamentListSerializer carries no my_prize_cents or my_prize_coins, so
 * there is nothing to read and this returns null until the backend has the
 * field. Callers must draw the column with it missing — which they have to do
 * anyway, since most rows will never have one.
 */
export function rowMoney(tournament, entries = rowEntries(tournament)) {
  const t = tournament || {};
  const coins = t.buy_in_coins || 0;
  const cents = t.buy_in_cents || 0;

  // Coins first, matching totalPool: a tournament priced in coins is a coin
  // tournament, and a stray cents field on one is not a second price.
  const stake = coins > 0
    ? { kind: "coins", amount: coins }
    : cents > 0
      ? { kind: "euros", amount: cents }
      : null;

  return { stake, pool: totalPool(t, entries), net: null };
}

/**
 * What a night that is over has to say about itself, beyond your own placing.
 *
 * Two things, and the row draws them as two things: who won it and how long it
 * took. It used to be a string built inline out of four fragments and three
 * separators, which is how "· you 7th · 23 played · took 1h 20m" ended up
 * competing with the winner's name for the same truncated line.
 */
export function historyLine(tournament, { elapsed = null } = {}) {
  const t = tournament || {};
  return { winner: t.winner_name || null, duration: elapsed || null };
}
