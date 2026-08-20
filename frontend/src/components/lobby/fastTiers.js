/**
 * What a tier card says, and whether its button does anything.
 *
 * Pure, and tested, for the usual reason: "can I sit here" has four answers —
 * you are already in one, you cannot afford it, this one is filling up, or yes —
 * and a button that offers what the server refuses is worse than no button.
 *
 * The formats themselves come off the wire (see tournaments/fastgames.py), so
 * adding a fourth needs nothing here.
 */

/** "Heads up · 25bb · 5-10 min" — the shape of the game in one line. */
export function tierBlurb(format) {
  if (!format) return "";
  // Two players is heads up. Calling it "2-max" is technically right and
  // nobody says it.
  const seats = format.seats === 2 ? "Heads up" : `${format.seats}-max`;
  return [seats, `${format.big_blinds}bb`, format.duration].filter(Boolean).join(" · ");
}

/** How full the waiting game is, as [seated, needed]. */
export function seatCounts(tier) {
  return [tier.game?.seats || 0, tier.seats_needed || 0];
}

/** Whether this tier is the one your own seat is at. */
export function isMyTier(tier, mine) {
  return Boolean(mine && mine.key === tier.key && mine.stake === tier.stake);
}

/**
 * What this tier's button should do and say.
 *
 * `mine` is your own live game, from the lobby payload — a seat at this tier
 * makes the button a way out of it, and a seat anywhere else makes every tier
 * unavailable, because one game at a time is the rule the server enforces.
 */
export function tierAction(tier, { mine = null, balance = null } = {}) {
  if (isMyTier(tier, mine)) {
    if (mine.status === "lobby") {
      return { kind: "leave", label: "Leave", enabled: true, note: "Waiting for players" };
    }
    return { kind: "open", label: "Open table", enabled: true, note: "Your game is running" };
  }
  if (mine != null) {
    return {
      kind: "busy", label: "Sit", enabled: false,
      note: `You are already in a ${mine.label || "game"}`,
    };
  }
  if (balance != null && balance < tier.stake) {
    return { kind: "broke", label: "Sit", enabled: false, note: "Not enough coins" };
  }
  return { kind: "sit", label: "Sit", enabled: true, note: null };
}

/** The prize ladder of a drawn game, longest odds last, ready to print. */
export function prizeRows(tier) {
  return (tier.odds || []).map((row) => ({
    ...row,
    // Two decimals is enough for the rarest row and not silly on the commonest.
    chance: `${Number(row.chance_pct.toFixed(2))}%`,
  }));
}

/** What a Sit n Go pays, as places rather than odds. */
export function payoutRows(tier) {
  return tier.payouts || [];
}
