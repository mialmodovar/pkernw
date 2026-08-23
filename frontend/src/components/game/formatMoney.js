import { formatCoins } from "../lobby/buyIn";

// Bounties are money, not chips, and money is held as an integer everywhere on
// the server. One formatter so a bounty reads the same on a nameplate, in the
// info panel and in the action log — and one below that decides, once, which
// money a particular game's is in.
export function formatEuros(cents) {
  if (!cents) return "€0";
  const euros = cents / 100;
  // Whole euros lose the ".00": a table full of "€10.00" pills is just noise.
  return `€${euros.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(euros) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}


/**
 * A bounty, in whatever this game's money actually is.
 *
 * Every bounty amount in this app is an opaque integer in a field named for
 * cents — see tournaments/fastgames.py, which says so out loud — and the unit
 * depends on the game. At a euro tournament they are cents. In All In or Fold
 * the whole buy-in goes onto a head and the buy-in is coins, so they are
 * coins, and a twenty-five coin head was being printed as €0.25.
 *
 * `fast` is the game's own format payload, and it is the whole of the question:
 * the fast formats are the coin games, and they are the only games that put a
 * coin on somebody's head.
 */
export function formatBounty(amount, fast) {
  return fast?.stake_coins ? formatCoins(amount) : formatEuros(amount);
}
