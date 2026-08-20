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

/** "2 players · 25bb · 5-10 min" — the shape of the game in one line.
 *
 *  Said in players rather than as "2-max", which is technically right and
 *  nobody says out loud. The format's name is right beside this, so it does not
 *  need repeating here.
 */
export function formatMeta(format) {
  if (!format) return "";
  return [
    `${format.seats} players`,
    `${format.big_blinds}bb`,
    format.duration,
  ].filter(Boolean).join(" · ");
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

/**
 * What you are playing for, in the one line a card has room for.
 *
 * This used to be behind a "Prizes" button, which meant the only number on the
 * card was what it cost — a card that says what it takes and not what it pays.
 * The button is still there for the whole table; this is the headline.
 *
 * Returns {label, value}, so a card can lay the two out rather than parse a
 * sentence back apart.
 */
export function prizeSummary(tier, format) {
  const coins = (amount) => `\u{1FA99} ${Number(amount || 0).toLocaleString()}`;

  if (format?.draws_multiplier) {
    const prizes = (tier.odds || []).map((row) => row.prize_coins).filter(Boolean);
    if (!prizes.length) return { label: "Prize", value: "drawn at the table" };
    // The range is the format: most of the time it is the bottom of it, and the
    // top is the reason anybody sits down.
    return {
      label: "Prize",
      value: `${coins(Math.min(...prizes))} – ${coins(Math.max(...prizes))}`,
    };
  }

  const payouts = tier.payouts || [];
  if (payouts.length === 0) return { label: "Prize", value: "—" };
  if (payouts.length === 1) return { label: "Winner takes", value: coins(payouts[0].coins) };
  return {
    label: `Top ${payouts.length} paid`,
    value: payouts.map((row) => coins(row.coins)).join(" · "),
  };
}

/**
 * The seats, as filled and empty.
 *
 * A row of pips says "one of three" faster than the words do, and it is the
 * thing being watched while you wait — the count beside it is for anybody who
 * wants the number rather than the shape.
 */
export function seatPips(tier) {
  const [seated, needed] = seatCounts(tier);
  return Array.from({ length: needed }, (_, index) => index < seated);
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
