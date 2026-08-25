/**
 * Reading a Friends Battle out loud.
 *
 * The server settles the argument — who wins each row, and how many rows each
 * — and this is the sentence a person actually reads: "You lead 3–2 over 7
 * nights". Small, and here rather than in the JSX, because every one of these
 * is a chance to say something wrong to somebody about their friend: a lead
 * that reads backwards, or "1 nights".
 */

const ordinal = (n) => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${suffix}`;
};

/** The one line at the top of the card. `them` is the name to use for them. */
export function headline(battle, them = "They") {
  if (!battle || !battle.nights) return "You have not played a night together yet.";
  const { mine = 0, theirs = 0, leader } = battle.score || {};
  const nights = `${battle.nights} night${battle.nights === 1 ? "" : "s"} together`;
  if (leader === "tie") return `All square at ${mine}–${theirs} over ${nights}`;
  const who = leader === "me" ? "You lead" : `${them} leads`;
  const score = leader === "me" ? `${mine}–${theirs}` : `${theirs}–${mine}`;
  return `${who} ${score} over ${nights}`;
}

/**
 * One number, as it should be printed.
 *
 * A finish is an ordinal and a nothing is a dash — a best finish of zero means
 * neither of you has finished a night together, not that somebody came zeroth.
 * Prize money is in cents on the wire, like everywhere else in the app.
 */
export function cellValue(key, value) {
  if (key === "best") return value ? ordinal(value) : "—";
  if (key === "winnings") return value ? `${(value / 100).toFixed(2)}€` : "—";
  return String(value ?? 0);
}

/** Whether this row is worth drawing at all: a row of two zeroes says nothing
 *  about anybody, and four of them make the card look broken rather than new. */
export function worthShowing(row) {
  return Boolean(row) && Boolean(row.mine || row.theirs);
}
