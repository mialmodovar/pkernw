/**
 * How many places pay, and what each of them is worth.
 *
 * Setting up a prize pool used to mean typing a place number, a label and a
 * percentage into a grid, one row per paid place, and getting the percentages to
 * total exactly 100 yourself. Nobody thinks about a tournament that way. What a
 * host actually decides is "the top fifth get paid", and the split follows from
 * that — so that is what the form asks for, and this works out the rest.
 *
 * The grid is still there for anybody who wants to move a number; this is what
 * it starts from.
 */

// The share of the field that pays, as most tournaments run it. A sixth is the
// usual home-game answer and about what a live event pays.
export const DEFAULT_PAID_PCT = 20;

// Shares are whole percentages, so a hundred places is the most that can each
// be paid something. Beyond that the tail rounds to nothing, and a paid place
// worth nothing is not a paid place.
export const MAX_PAID_PLACES = 100;

/** How many places pay, given a field and a share of it. Always at least one. */
export function placesPaid(fieldSize, pct) {
  const field = Math.max(1, Math.floor(fieldSize || 0));
  const share = Math.max(0, Math.min(100, Number(pct) || 0));
  const places = Math.round((field * share) / 100);
  return Math.max(1, Math.min(field, MAX_PAID_PLACES, places));
}

/** What share of the field a given number of places actually is. */
export function paidPct(fieldSize, places) {
  const field = Math.max(1, Math.floor(fieldSize || 0));
  return Math.round((Math.max(1, places) / field) * 100);
}

const ordinal = (place) => {
  const suffix = place % 100 >= 11 && place % 100 <= 13
    ? "th"
    : ["th", "st", "nd", "rd"][place % 10] || "th";
  return `${place}${suffix}`;
};

/**
 * The split itself: steep at the top, flattening out down the places.
 *
 * A decay rather than a table of hand-written structures, so it answers for any
 * number of places — and largest-remainder rounding so the percentages total
 * exactly 100, which is what the server insists on and what a host would
 * otherwise have to arrange by hand.
 */
export function payoutCurve(places) {
  const count = Math.max(1, Math.min(MAX_PAID_PLACES, Math.floor(places || 1)));
  if (count === 1) return [{ place: 1, label: "1st", percentage: 100 }];

  // A whole percent to every paid place before the curve gets a look at the
  // rest. Without this the tail of a deep structure floors to zero — twenty
  // places is fine, sixty is not — and a place paid nothing is a place the
  // server rightly refuses to call paid.
  const floorShare = 1;
  const spread = 100 - floorShare * count;

  // Each place is worth a shade less than the one above it. The exponent is
  // what makes first place worth roughly twice second in a small field and
  // several times it in a big one, which is how these are usually paid.
  const weights = Array.from({ length: count }, (_, index) => 1 / (index + 1) ** 0.8);
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  const exact = weights.map((weight) => floorShare + (weight / total) * spread);
  const shares = exact.map((value) => Math.floor(value));
  let short = 100 - shares.reduce((sum, value) => sum + value, 0);
  // The parts of a percent go to whoever the flooring cost most, in order.
  const order = [...shares.keys()].sort(
    (a, b) => (exact[b] - shares[b]) - (exact[a] - shares[a]),
  );
  for (const index of order) {
    if (short <= 0) break;
    shares[index] += 1;
    short -= 1;
  }

  return shares.map((percentage, index) => ({
    place: index + 1,
    label: ordinal(index + 1),
    percentage,
  }));
}

/** What one buy-in's bounty is worth, given a share of it. */
export function bountyCentsFor(buyInCents, pct) {
  const share = Math.max(0, Math.min(99, Number(pct) || 0));
  return Math.round((Math.max(0, buyInCents || 0) * share) / 100);
}

/** And back the other way, for a tournament that was set up with an amount. */
export function bountyPctOf(buyInCents, bountyCents) {
  if (!buyInCents) return 50;
  return Math.round((Math.max(0, bountyCents || 0) / buyInCents) * 100);
}


/**
 * What a share of the field comes to, as the field fills.
 *
 * The share is the setting and the places are what it means, so the form has to
 * show the second rather than only the first — and it cannot show one number,
 * because there is no one number until registration closes. A few points along
 * the way says it better than any single figure: "a fifth" is one place at five
 * players and four at twenty.
 *
 * This is the bug it replaces. The form worked the places out from the player
 * *cap*: twenty per cent of a cap of a hundred is twenty paid places, printed
 * as fact, for a night five people would register for.
 */
export function shareExamples(pct, cap = MAX_PAID_PLACES) {
  const ceiling = Math.max(2, Math.floor(cap || 0) || MAX_PAID_PLACES);
  const fields = [5, 10, 20, 50].filter((field) => field <= ceiling);
  // Always the cap itself, so a host can see where a full house lands.
  if (!fields.includes(ceiling)) fields.push(ceiling);
  return fields.map((field) => ({ field, places: placesPaid(field, pct) }));
}
