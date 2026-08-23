/**
 * The cash lobby, as reading rather than markup.
 *
 * A tournament list is a list of events and reads chronologically. A cash lobby
 * is a list of rooms and reads by how busy they are: nobody scans it for the
 * table that opened first, they scan it for one with a game in it and a chair
 * free. So that is the order, and it is here rather than in the component
 * because "busy" is a judgement and judgements are worth a test.
 */

/** How many can still sit down. */
export function freeSeats(table) {
  return Math.max(0, (table?.seats || 0) - (table?.taken || 0));
}

/** Whether there is a hand being dealt at all. Two players is a game. */
export function isRunning(table) {
  return (table?.taken || 0) >= 2;
}

/**
 * The order a lobby is read in: games first, then tables filling up, then the
 * empty ones — and a table you are already sitting at above all of them,
 * because that is not a table you are choosing, it is one you are at.
 */
export function lobbyOrder(tables) {
  return [...(tables || [])].sort((a, b) => (
    (b.my_seat != null) - (a.my_seat != null)
    || isRunning(b) - isRunning(a)
    || (b.taken || 0) - (a.taken || 0)
    || (a.big_blind || 0) - (b.big_blind || 0)
    || (a.id || 0) - (b.id || 0)
  ));
}

/** The tables at one rung of the ladder. */
export function atStake(tables, key) {
  return lobbyOrder(tables).filter((one) => one.stake === key);
}

/** What one row says about itself, in the few words a row has. */
export function tableSummary(table) {
  if (!table) return "";
  if (table.my_seat != null) return "You are sitting here";
  const free = freeSeats(table);
  if (free === 0) return "Full";
  if (!isRunning(table)) {
    return (table.taken || 0) === 0 ? "Empty — start one" : "Waiting for one more";
  }
  return `${table.taken} playing · ${free} free`;
}

/**
 * What to offer as a buy-in before anybody types anything.
 *
 * Seventy-five big blinds, or whatever they can afford under that — the middle
 * of a fifty-to-a-hundred range, which is what most people would have typed and
 * nobody has to think about. Never below the table minimum: an amount that
 * cannot be paid is not a suggestion, and the field says so rather than the
 * server.
 */
export function suggestedBuyIn(table, balance) {
  if (!table) return 0;
  const middle = (table.big_blind || 0) * 75;
  const affordable = Math.min(middle, balance ?? middle, table.max_buy_in || middle);
  return Math.max(table.min_buy_in || 0, affordable);
}

/** Whether this player can sit here at all, and why not when they cannot. */
export function sitBlocker(table, balance) {
  if (!table) return "No table";
  if (table.my_seat != null) return null;
  if (freeSeats(table) === 0) return "Full";
  if ((balance ?? 0) < (table.min_buy_in || 0)) {
    return `Needs ${table.min_buy_in} to sit down`;
  }
  return null;
}

/**
 * What a table with nobody to deal to should say for itself.
 *
 * An empty cash table is not broken and not between hands — it is waiting, and
 * a room that says nothing while it waits reads as one that has stopped
 * working. Which of the three waits it is matters: a seat that is sitting out
 * is a different problem from a table nobody else has found yet.
 */
export function waitingLine(waiting) {
  if (!waiting) return "";
  const seated = waiting.seated || 0;
  const ready = waiting.dealable || 0;
  const away = waiting.away || 0;
  if (ready >= 2) return "";
  if (seated <= 1) return "Waiting for another player to sit down.";
  // Taken chairs with nobody behind them. Worth saying out loud rather than
  // counting as players: a table that says "2 seated" and then does not deal
  // reads as broken, and what is actually happening is that somebody has left
  // the page. They are not dealt in, so nobody pays blinds for their absence,
  // and the table gives their seat up if they stay gone.
  if (away > 0) return "Waiting — somebody here is away from the table.";
  if (ready <= 0) return "Waiting — nobody at the table is being dealt in.";
  return "Waiting — somebody here is sitting out or out of chips.";
}

/**
 * The chairs at a table, in order, with whoever is in them.
 *
 * Where you sit is who acts after you, which is most of what a seat is worth,
 * so it is a choice rather than something handed out. Seats are numbered from
 * zero everywhere the server counts them and from one everywhere a person
 * reads them — that translation belongs here, once.
 */
export function seatOptions(table) {
  if (!table) return [];
  const byNumber = new Map((table.players || []).map((one) => [one.seat, one]));
  return Array.from({ length: table.seats || 0 }, (_unused, seat) => {
    const player = byNumber.get(seat);
    return {
      seat,
      label: `Seat ${seat + 1}`,
      taken: Boolean(player),
      name: player ? player.display_name || player.username : "",
      mine: player != null && seat === table.my_seat,
      // The face, so the chairs can be drawn as the people in them. Choosing
      // where to sit is choosing who to sit next to, and a row of numbers does
      // not tell anybody that.
      avatar: player || null,
    };
  });
}

/** The chair to offer before anybody picks one: the first one free. */
export function defaultSeat(table) {
  const free = seatOptions(table).find((one) => !one.taken);
  return free ? free.seat : null;
}

/**
 * What a lobby row offers this player: to sit, to watch, or both.
 *
 * Watching is not a consolation for a table you cannot sit at, though it is
 * that too — it is how anybody decides whether they want a seat at all, which
 * is why it is offered at a table with room as readily as at a full one. There
 * is nothing to watch at a table with no game in it, and a row with a button
 * that leads to an empty felt is worse than a row with one button.
 */
export function rowActions(table, balance) {
  if (!table) return { sit: null, watch: false, seated: false };
  if (table.my_seat != null) return { sit: null, watch: false, seated: true };
  const blocked = sitBlocker(table, balance);
  return {
    sit: blocked ? null : "Sit down",
    blocked,
    watch: isRunning(table),
    seated: false,
  };
}
