/**
 * The two lists under the Spin n Go tiers: what happened to you, and the
 * records.
 *
 * Pure, so the copy is testable and the same everywhere. Both lists are the same
 * shape from the server — a finished game with its draw and its winner — and
 * differ only in how they read: your own row leads with where you came, and a
 * record leads with who did it.
 */

/** "10× · 250" for a drawn game, "100" for one that pays what it took. The
 *  chip is drawn beside the line rather than repeated inside it. */
export function drawLabel(row) {
  const prize = Number(row.prize_coins || 0).toLocaleString();
  return row.multiplier ? `${row.multiplier}× · ${prize}` : prize;
}

/** Who won it, as a nickname. Nobody's real name goes on a leaderboard. */
export function winnerName(row) {
  return row.winner?.display_name || row.winner?.username || "—";
}

// Enough places for the biggest of these formats, which seats six.
const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th"];

/**
 * How your own game went, in two words.
 *
 * "Won" rather than "1st": these are short enough that people remember whether
 * they won, not what they placed.
 */
export function myResult(row) {
  if (row.i_won) return "won";
  if (row.my_finish == null) return "";
  return ORDINALS[row.my_finish] || `${row.my_finish}th`;
}

/**
 * What you took out of it.
 *
 * The server reads this off the coin ledger rather than working it out from
 * where you came, because a six-max pays two places — second taking something
 * is exactly the case that arithmetic here would miss.
 */
export function myReturn(row) {
  return row?.my_return || 0;
}

/**
 * Your net across the games shown, in coins.
 *
 * Worth a line because the format is designed to look like it loses: two thirds
 * of these are a stake gone, and the number underneath is the answer to "am I
 * actually down". Only counts the games in the list, and says so.
 */
export function historyNet(rows = []) {
  return rows.reduce((sum, row) => sum + myReturn(row) - (row.stake || 0), 0);
}

/** "+120" / "-75" / "even" — a net, with its sign said out loud. */
export function netLabel(net) {
  if (!net) return "even";
  return `${net > 0 ? "+" : "−"}${Math.abs(net).toLocaleString()}`;
}
