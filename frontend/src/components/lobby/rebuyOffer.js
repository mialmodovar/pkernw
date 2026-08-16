/**
 * Whether to offer a player their way back in, and on what terms.
 *
 * Busting out is the one moment the game takes you off the screen that had the
 * buttons on it, and the offer used to live only there: the strip that appears
 * for ten seconds, and the elimination screen behind it. Close either one — or
 * go home and come back — and a tournament still taking rebuys had no way to
 * take yours. So the same question is answered in one place and asked from
 * three: the table, the tournament lobby, and the list on the home page.
 *
 * `tournament` is either payload, list row or full detail. `eliminated` and
 * `rebuysUsed` come from whichever shape of seat the caller is holding.
 */
export function rebuyOffer(tournament, { eliminated, rebuysUsed = 0 } = {}) {
  if (!tournament || !eliminated) return null;
  if (!tournament.allow_rebuys) return null;
  if (!["running", "paused"].includes(tournament.status)) return null;
  // Only the running engine knows which blind level it is on, so whether the
  // period has closed is the server's answer, not one worked out from here. An
  // older payload that does not carry it falls through to offering the button:
  // the endpoint is the authority either way and refuses in words worth
  // reading.
  if (tournament.rebuys_open === false) return null;

  // Null is unlimited, so there is no number to count down from.
  const capped = tournament.max_rebuys !== null && tournament.max_rebuys !== undefined;
  const left = capped ? tournament.max_rebuys - rebuysUsed : Infinity;
  if (left <= 0) return null;

  return { chips: tournament.starting_chips ?? null, left, capped };
}

/** "Rebuy — 10,000 chips (2 left)", for a button with room to say it. */
export function rebuyLabel(offer) {
  if (!offer) return "";
  const chips = offer.chips ? ` — ${offer.chips.toLocaleString()} chips` : "";
  return `Rebuy${chips}${offer.capped ? ` (${offer.left} left)` : ""}`;
}
