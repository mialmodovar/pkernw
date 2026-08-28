/**
 * What a tier row says, and whether its button does anything.
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

/** Whether this game of yours is one at this tier. */
export function isMyTier(tier, mine) {
  return Boolean(mine && mine.key === tier.key && mine.stake === tier.stake);
}

/**
 * The games of your own at this tier, waiting ones first.
 *
 * More than one is possible: a game of yours that is already dealing does not
 * hold the tier, so you can be playing one and queued for the next.
 */
export function myTierGames(tier, myGames) {
  const mine = (myGames || []).filter((game) => isMyTier(tier, game));
  return [
    ...mine.filter((game) => game.status === "lobby"),
    ...mine.filter((game) => game.status !== "lobby"),
  ];
}

/** The seat of yours at this tier that has not been dealt to, if there is one. */
export function myQueueAt(tier, myGames) {
  return myTierGames(tier, myGames).find((game) => game.status === "lobby") || null;
}

/** Games of yours at this tier that are already dealing — tables to open. */
export function myTablesAt(tier, myGames) {
  return myTierGames(tier, myGames).filter((game) => game.status !== "lobby");
}

/**
 * What this tier's main button should do and say.
 *
 * Three answers: you are in this one already, so the button is the way out of
 * it; you cannot afford it; or you can sit. Being in a game at *another* tier
 * is deliberately not one of them — that used to close the whole lobby, which
 * is a rule with nothing behind it now the tables have a tab strip.
 */
export function tierAction(tier, { queued = null, balance = null } = {}) {
  if (queued) {
    const seated = queued.seats || 0;
    const needed = queued.seats_needed || tier.seats_needed || 0;
    return {
      kind: "unregister",
      // "Leave", not "Unregister": it is the word the row underneath uses for
      // giving up a seat at a game of yours that is waiting, and the two
      // buttons do the same thing to the same kind of seat. It also fits the
      // column the row gives it, which "Unregister" did not.
      label: "Leave",
      enabled: true,
      note: `You are seated \u00b7 waiting for ${Math.max(0, needed - seated)} more`,
      game: queued,
    };
  }
  if (balance != null && balance < tier.stake) {
    return { kind: "broke", label: "Sit", enabled: false, note: "Not enough coins" };
  }
  return { kind: "sit", label: "Sit", enabled: true, note: null };
}

/** What the row for one of your own games at a tier says and offers. */
export function myGameAction(game) {
  if (game?.status === "lobby") {
    const [seated, needed] = [game.seats || 0, game.seats_needed || 0];
    return {
      kind: "leave", label: "Leave",
      note: `Waiting · ${seated} of ${needed} seated`,
    };
  }
  return { kind: "open", label: "Open table", note: "Your game here is dealing" };
}

/**
 * What you are playing for, in the one line a row has room for.
 *
 * This used to be behind a "Prizes" button, which meant the only number on the
 * row was what it cost — a row that says what it takes and not what it pays.
 * The whole table is still a caret away; this is the headline.
 *
 * Returns {label, value}, so a row can lay the two out rather than parse a
 * sentence back apart.
 */
export function prizeSummary(tier, format) {
  // Figures only. The chip is drawn beside them by the row — it is one icon
  // for the whole line rather than one per number, which is what the emoji
  // version turned into: "🪙 97 · 🪙 52".
  const coins = (amount) => Number(amount || 0).toLocaleString();

  if (format?.draws_multiplier) {
    // The winner's share, not the pool: at the top of the ladder they are
    // different numbers, and the headline is what one player takes home.
    const prizes = (tier.odds || [])
      .map((row) => row.winner_coins ?? row.prize_coins)
      .filter(Boolean);
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
    // What the winner takes, which is the pool until the pool is shared. The
    // server sends both; a row that quietly printed the pool as the prize would
    // be overstating first place by a fifth on exactly the rows people read
    // most carefully.
    prize: Number(row.winner_coins ?? row.prize_coins ?? 0),
    shared: Boolean(row.shared),
  }));
}

/**
 * Whether any row of this tier shares its prize, so the panel knows whether the
 * ladder needs a line explaining itself.
 */
export function hasSharedPrizes(tier) {
  return (tier.odds || []).some((row) => row.shared);
}

/** What a Sit n Go pays, as places rather than odds. */
export function payoutRows(tier) {
  return tier.payouts || [];
}
