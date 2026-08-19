/**
 * What a Spin n Go tier card says, and whether its button does anything.
 *
 * Pure, and tested, for the usual reason: "can I sit here" has four answers —
 * you are already in one, you cannot afford it, this one is filling up, or yes —
 * and a button that offers what the server refuses is worse than no button.
 */

/** "3-max · 15bb · 3-5 min", the format in one line. */
export function tierBlurb(tier) {
  const seats = tier.seats_needed || 3;
  const blinds = tier.big_blinds || 15;
  return `${seats}-max · ${blinds}bb · 3-5 min`;
}

/** How full the waiting game is, as [seated, needed]. */
export function seatCounts(tier) {
  return [tier.game?.seats || 0, tier.seats_needed || 3];
}

/**
 * What this tier's button should do and say.
 *
 * `mine` is your own live Spin n Go, from the lobby payload — a seat at this
 * tier makes the button a way out of it, and a seat at the other one makes both
 * tiers unavailable, because one at a time is the rule the server enforces.
 */
export function tierAction(tier, { mine = null, balance = null } = {}) {
  const mineIsHere = mine != null && mine.stake === tier.stake;

  if (mineIsHere && mine.status === "lobby") {
    return { kind: "leave", label: "Leave", enabled: true, note: "Waiting for players" };
  }
  if (mineIsHere) {
    return { kind: "open", label: "Open table", enabled: true, note: "Your game is running" };
  }
  if (mine != null) {
    return {
      kind: "busy", label: "Sit", enabled: false,
      note: `You are already in the ${mine.stake} table`,
    };
  }
  if (balance != null && balance < tier.stake) {
    return { kind: "broke", label: "Sit", enabled: false, note: "Not enough coins" };
  }
  return { kind: "sit", label: "Sit", enabled: true, note: null };
}

/** The prize ladder, longest odds last, ready to print. */
export function prizeRows(tier) {
  return (tier.odds || []).map((row) => ({
    ...row,
    // Two decimals is enough for the rarest row and not silly on the commonest.
    chance: `${Number(row.chance_pct.toFixed(2))}%`,
  }));
}
