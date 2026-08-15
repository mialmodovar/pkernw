/**
 * What a place is worth, in money.
 *
 * A percentage is a rule for splitting a pot, not an answer to "what do I win".
 * Wherever there is a buy-in, the money is knowable, so the money is what gets
 * shown — the percentage only survives where there is no pot to apply it to.
 *
 * All cents, like everything else that touches money here.
 */

import { formatEuros } from "./formatMoney";

/** Entries, counting rebuys — each one is another buy-in into the pot. */
export function entryCount(tournament) {
  return (tournament?.players || []).reduce((sum, p) => sum + 1 + (p.rebuy_count || 0), 0);
}

/**
 * The pot the payout structure divides.
 *
 * In a knockout tournament part of every buy-in went onto a head instead, and
 * was paid out hand by hand. Counting it here would promise a first prize that
 * does not exist.
 */
export function placingPoolCents(tournament, entries = entryCount(tournament)) {
  const buyIn = tournament?.buy_in_cents || 0;
  const bounty = (tournament?.bounty_mode || "none") !== "none" ? (tournament?.bounty_cents || 0) : 0;
  return Math.max(0, buyIn - bounty) * entries;
}

/** One row's share of that pot, in cents — or null when there is no pot. */
export function placeCents(tournament, percentage, entries) {
  const pool = placingPoolCents(tournament, entries);
  if (pool <= 0) return null;
  return Math.round(pool * percentage / 100);
}

/**
 * How to label a payout row: the money if there is any, else the percentage.
 *
 * The fallback is not a compromise — a tournament with no buy-in has nothing
 * but the split to state, and stating it is better than showing "€0".
 */
export function payoutLabel(tournament, row, entries) {
  const cents = placeCents(tournament, row.percentage, entries);
  return cents == null ? `${row.percentage}%` : formatEuros(cents);
}
