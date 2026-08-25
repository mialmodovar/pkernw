/**
 * The four buttons above the raise slider, and what each one is worth.
 *
 * Two rules, and the second one is the bug this replaces. Before the flop a
 * raise is said in blinds — "three bb" is how everybody at a table talks about
 * an open — and after it, in a share of the pot. That was already true here.
 * What was not is that "before the flop" was read as "always", so once somebody
 * had opened to four blinds the three blind-sized buttons all clamped to the
 * minimum raise: three buttons showing 2bb, 2.5bb and 3.5bb that all did the
 * same thing, and none of them the thing they said.
 *
 * So blinds are for an *unopened* pot, which is the only place they mean
 * anything, and a pot somebody has already raised is priced as a share of it —
 * before the flop exactly as after it.
 *
 * And the sizes are the player's own. What a host thinks a standard open is has
 * nothing to do with anybody else's game, so the two lists live in the account
 * and this only decides which of them is being read.
 */

// What the app opens with, for anybody who has never touched them. Three
// blind-sized opens and three shares of the pot, which is roughly how a home
// game plays.
export const DEFAULT_PREFLOP_BB = [2, 2.5, 3.5];
export const DEFAULT_POSTFLOP_PCT = [25, 40, 75];

// Nobody needs eight buttons and the row has four slots, one of which is all-in.
export const MAX_SIZES = 3;

/**
 * What a size may be, and how far one press of a stepper moves it.
 *
 * Bounds rather than validation: the settings offer arrows as well as a field,
 * and an arrow that walks off into a 400bb open or a negative share of the pot
 * is an arrow nobody can use. Half a blind and five points of the pot are the
 * steps people actually talk in — nobody opens to 2.37 blinds.
 */
export const SIZE_LIMITS = {
  preflop: { step: 0.5, min: 1, max: 25 },
  postflop: { step: 5, min: 5, max: 300 },
};

/**
 * One press of a stepper.
 *
 * Snapped to the step rather than added to whatever was typed: from 2.3, one
 * press up gives 2.5, not 2.8. Somebody who typed 2.3 on purpose keeps it until
 * they touch an arrow, and the moment they do they are back on the grid the
 * rest of the table thinks in.
 */
export function nudge(value, delta, { step, min, max }) {
  // An empty field is nothing, not zero — `Number("")` is 0, which would step
  // up from a size nobody has and land on the smallest one twice over.
  const raw = typeof value === "string" ? value.trim() : value;
  const parsed = raw === "" || raw == null ? NaN : Number(raw);
  const from = Number.isFinite(parsed) ? parsed : min;
  const grid = delta > 0 ? Math.floor(from / step) : Math.ceil(from / step);
  const next = (grid + delta) * step;
  return Math.round(Math.min(max, Math.max(min, next)) * 10) / 10;
}

/** A stored list, made safe: numbers only, in order, and no more than three. */
export function cleanSizes(sizes, fallback) {
  const clean = (sizes || [])
    .map((one) => Number(one))
    .filter((one) => Number.isFinite(one) && one > 0)
    .map((one) => Math.round(one * 10) / 10)
    .slice(0, MAX_SIZES);
  return clean.length ? clean : [...fallback];
}

/**
 * Whether a pot has already been raised into.
 *
 * Before the flop the big blind is a bet nobody chose, so a pot where the most
 * anybody has put in is one big blind is still unopened. After it, any bet at
 * all is action.
 */
export function potIsOpen({ street, streetBet = 0, bb = 0 }) {
  if (street !== "preflop") return streetBet > 0;
  return streetBet > bb;
}

/**
 * What a share of the pot is worth as a raise, in chips.
 *
 * The pot *after calling*, which is what everybody means by a pot-sized raise
 * and the only reading that does not collapse. Facing a four-blind open with
 * seven blinds in the middle, a quarter of the pot as a bet is under two
 * blinds — less than the minimum raise — so all three buttons would clamp to
 * the minimum and say three different wrong things, which is the bug this file
 * exists for said a second way.
 *
 * Call first, then raise a share of what is then in front of everybody. With
 * nothing to call it is a share of the pot, exactly as before.
 */
export function raiseToShare({ pct, pot = 0, streetBet = 0, toCall = 0 }) {
  const after = Math.max(0, pot) + Math.max(0, toCall);
  return Math.round(streetBet + toCall + (after * pct) / 100);
}

/**
 * The presets to draw, as `[{ label, chips, emphasis }]`.
 *
 * `clamp` is the caller's — the panel knows what a legal raise is — and every
 * size goes through it, so a button never offers an amount the server would
 * refuse. All in is last and always there: it is the one size that needs no
 * arithmetic and the one nobody should have to find.
 */
export function betPresets({
  street,
  streetBet = 0,
  toCall = 0,
  pot = 0,
  bb = 0,
  maxRaise = 0,
  preflopBB = DEFAULT_PREFLOP_BB,
  postflopPct = DEFAULT_POSTFLOP_PCT,
  clamp = (chips) => chips,
}) {
  const opened = potIsOpen({ street, streetBet, bb });
  const inBlinds = street === "preflop" && !opened;

  const sizes = inBlinds
    ? cleanSizes(preflopBB, DEFAULT_PREFLOP_BB)
    : cleanSizes(postflopPct, DEFAULT_POSTFLOP_PCT);

  const priced = inBlinds
    ? sizes.map((bbs) => ({ label: `${bbs}bb`, chips: clamp(Math.round(bbs * bb)) }))
    : sizes.map((pct) => ({
      label: `${pct}%`,
      chips: clamp(raiseToShare({ pct, pot, streetBet, toCall })),
    }));

  return [...priced, { label: "All in", chips: maxRaise, emphasis: true }];
}
