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

/** "50" — coins, and coins are always whole. The count alone, for the places
 *  that draw the chip beside it (see components/icons). */
export function coinCount(coins) {
  return Number(coins || 0).toLocaleString();
}

/** "50 coins" — for prose, where an icon mid-sentence reads as a rebus. */
export function formatCoins(coins) {
  return `${coinCount(coins)} coins`;
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

/**
 * Whether this is played for actual money.
 *
 * The one question worth asking before a seat is taken, and it has exactly one
 * answer: a euro buy-in. Coins are the app's own currency and cost nobody
 * anything real; euros are an agreement between people that this app writes
 * down and never touches.
 */
export function isRealMoney(tournament) {
  return (tournament?.buy_in_cents || 0) > 0;
}

/**
 * What taking a seat here commits you to, for the dialog that asks.
 *
 * `cost` is the whole buy-in — the bounty is a slice of it rather than a
 * surcharge on it (see TournamentCard, which subtracts one from the other to
 * size the prize pool), so a dialog that added them would be asking somebody to
 * agree to twice what they owe.
 *
 * `bounty` is that slice, named only when there is one: at a knockout night
 * most of what you are paying for is not the places, and somebody deciding
 * whether to sit should know which game they are buying into.
 */
export function realMoneyEntry(tournament) {
  const cents = tournament?.buy_in_cents || 0;
  const bounty = (tournament?.bounty_mode || "none") !== "none"
    ? (tournament?.bounty_cents || 0)
    : 0;
  return {
    cost: formatEurosPlain(cents),
    // Bounded by the buy-in: a bounty larger than the entry is a misconfigured
    // tournament, and the dialog should not repeat the mistake back as a fact.
    bounty: bounty > 0 ? formatEurosPlain(Math.min(bounty, cents)) : null,
  };
}

/** Whether this row is a Spin n Go, wherever that changes what is drawn. */
export function isSpinGo(tournament) {
  return tournament?.format === "spingo";
}

/** Whether it is a game somebody sat down at rather than a night they arranged. */
export function isFastGame(tournament) {
  return tournament?.format === "spingo" || tournament?.format === "sitngo";
}
