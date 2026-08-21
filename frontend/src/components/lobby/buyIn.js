/**
 * What a tournament costs and what it is playing for, in the currency it uses.
 *
 * There are two, and they are nothing like each other. Euros are a note of what
 * people agreed between themselves, which the app records and never touches.
 * Coins are the app's own currency, actually charged to a wallet and actually
 * paid back out. Both are printed in the same slot on a card, so the label has to
 * say which — a "50" that could be either is the worst possible version of this.
 *
 * Pure, so the lobby card and the tournament page cannot end up disagreeing about
 * a stake that people are deciding whether to pay.
 */

/** "🪙 50" — coins, and coins are always whole. */
export function formatCoins(coins) {
  return `\u{1FA99} ${Number(coins || 0).toLocaleString()}`;
}

/** "20.00€" — the way the lobby has always printed a euro buy-in. */
export function formatEurosPlain(cents) {
  return `${((cents || 0) / 100).toFixed(2)}€`;
}

/** What one entry costs: euros, coins, or nothing at all. */
export function buyInLabel(tournament) {
  const cents = tournament?.buy_in_cents || 0;
  const coins = tournament?.buy_in_coins || 0;
  if (cents > 0) return formatEurosPlain(cents);
  if (coins > 0) return formatCoins(coins);
  return "free";
}

/**
 * What is in the pot, given how many entries there have been.
 *
 * A Spin n Go's prize is not the entries — it was drawn — so it is read off the
 * multiplier instead, which is the one case where the pot is known before the
 * players are. Returns null when there is nothing to say, so a card can leave
 * the fact out rather than print "no prize" over a game with one.
 */
export function prizeLabel(tournament, entries) {
  const coins = tournament?.buy_in_coins || 0;
  const count = Math.max(0, entries || 0);

  if (coins > 0 && tournament?.format === "spingo") {
    const multiplier = tournament.spin_multiplier || 0;
    if (!multiplier) return "prize drawn at three players";
    return `${formatCoins(coins * multiplier)} prize`;
  }
  if (coins > 0) return count > 0 ? `${formatCoins(coins * count)} pool` : null;

  const cents = tournament?.buy_in_cents || 0;
  if (cents <= 0) return "no prize";
  return null;
}

/** Whether this row is a Spin n Go, wherever that changes what is drawn. */
export function isSpinGo(tournament) {
  return tournament?.format === "spingo";
}

/** Whether it is a game somebody sat down at rather than a night they arranged. */
export function isFastGame(tournament) {
  return tournament?.format === "spingo" || tournament?.format === "sitngo";
}
