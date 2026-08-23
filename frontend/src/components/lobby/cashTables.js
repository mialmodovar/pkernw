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
 * Fifty big blinds, or whatever they can afford under that — the middle of the
 * range, which is what most people would have typed and nobody has to think
 * about. Never below the table minimum: an amount that cannot be paid is not a
 * suggestion, and the field says so rather than the server.
 */
export function suggestedBuyIn(table, balance) {
  if (!table) return 0;
  const middle = (table.big_blind || 0) * 50;
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
