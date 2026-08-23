/**
 * What a place is worth, in whichever currency it is worth it in.
 *
 * A percentage is a rule for splitting a pot, not an answer to "what do I win".
 * Wherever there is a buy-in, the money is knowable, so the money is what gets
 * shown — the percentage only survives where there is no pot at all to apply it
 * to, which now means only the free tournaments that predate coins.
 *
 * Euros are cents, like everything else here that touches money. Coins are whole
 * and are the app's own, so a coin figure is not a note of what to settle later:
 * it is what lands in the wallet.
 */

import { formatEuros } from "./formatMoney";
import { formatCoins } from "../lobby/buyIn";

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
  const coins = placeCoins(tournament, row.percentage, entries);
  if (coins != null) return formatCoins(coins);
  const cents = placeCents(tournament, row.percentage, entries);
  return cents == null ? `${row.percentage}%` : formatEuros(cents);
}

/**
 * The coins the payout structure divides.
 *
 * A Spin n Go's pot was drawn rather than paid in, so it is the buy-in times the
 * multiplier and has nothing to do with how many entries there were. Everything
 * else is the buy-ins, rebuys included.
 */
export function poolCoins(tournament, entries = entryCount(tournament)) {
  const stake = tournament?.buy_in_coins || 0;
  if (stake <= 0) return 0;
  if (tournament?.format === "spingo") return stake * (tournament.spin_multiplier || 0);
  return stake * entries;
}

/** One row's share of the coin pot — or null when there is no coin pot. */
export function placeCoins(tournament, percentage, entries) {
  const pool = poolCoins(tournament, entries);
  if (pool <= 0) return null;
  // Floored, matching the server: it pays whole coins and hands the remainder
  // to first place, and a client that rounded up would promise a coin more than
  // the wallet is about to receive.
  return Math.floor(pool * percentage / 100);
}

/**
 * What a player was actually paid, preferred over anything recomputed.
 *
 * Once a game has settled, the ledger is the truth — it is what went into the
 * wallet or onto the tab. Before that lands, the arithmetic above is the best
 * answer there is. Returns null when there is nothing to say.
 */
export function paidLabel(tournament, record, row, entries) {
  if (record?.prize_coins > 0) return formatCoins(record.prize_coins);
  if (record?.prize_cents > 0) return formatEuros(record.prize_cents);
  if (!row) return null;
  return payoutLabel(tournament, row, entries);
}

/**
 * The whole prize pool, in whichever currency it is in.
 *
 * Everything paid in, bounties included. `placingPoolCents` above deliberately
 * leaves the bounty money out, because the percentages never divide it — but a
 * list is not dividing anything, and a knockout night whose card said "€150"
 * when €300 had been paid in was describing half of itself.
 *
 * Returns {kind, amount} — "euros" in cents, "coins" whole — or null when there
 * is no pool at all, so a caller can leave the fact out rather than print a
 * zero. Structured rather than formatted because the two currencies are drawn
 * differently: coins have a chip beside them.
 */
export function totalPool(tournament, entries = entryCount(tournament)) {
  const coins = poolCoins(tournament, entries);
  if (coins > 0) return { kind: "coins", amount: coins };

  const cents = (tournament?.buy_in_cents || 0) * Math.max(0, entries);
  if (cents > 0) return { kind: "euros", amount: cents };

  return null;
}

/**
 * Entries counted from a list row, which carries no rebuys.
 *
 * The lobby list sends a seat count and nothing about buy-backs, so a pool read
 * off it is what has been paid in by the people sitting there — right at the
 * start, and an undercount later in a tournament with rebuys. Named for what it
 * is so nobody reads the figure as final.
 */
export function seatedEntries(tournament) {
  return Math.max(0, tournament?.player_count || 0);
}
