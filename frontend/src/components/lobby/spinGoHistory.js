/**
 * The two lists under the Spin n Go tiers: what happened to you, and the
 * records.
 *
 * Pure, so the copy is testable and the same everywhere. Both lists are the same
 * shape from the server — a finished game with its draw and its winner — and
 * differ only in how they read: your own row leads with where you came, and a
 * record leads with who did it.
 */

/** "10× · 🪙 250" — the draw and what it paid. */
export function drawLabel(row) {
  return `${row.multiplier}× · \u{1FA99} ${Number(row.prize_coins || 0).toLocaleString()}`;
}

/** Who won it, as a nickname. Nobody's real name goes on a leaderboard. */
export function winnerName(row) {
  return row.winner?.display_name || row.winner?.username || "—";
}

/**
 * How your own game went, in two words.
 *
 * Third of three is last, and saying "3rd" flatters it; the format is short
 * enough that people remember whether they won, not what they placed.
 */
export function myResult(row) {
  if (row.i_won) return "won";
  if (row.my_finish == null) return "";
  return `${row.my_finish}${row.my_finish === 2 ? "nd" : "rd"}`;
}

/** What you took out of it — the prize if you won, nothing if you did not. */
export function myReturn(row) {
  return row.i_won ? row.prize_coins : 0;
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
