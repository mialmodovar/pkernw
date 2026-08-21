/**
 * A finished hand, arranged the way it was played.
 *
 * The stored hand is flat — one list of actions, each tagged with a street, and
 * one list of five community cards — which is the right thing to store and the
 * wrong thing to read. A hand that went four streets deep read as a wall of
 * names with three headings in it, and you could not see the board the players
 * were looking at when they acted.
 *
 * This puts it back together: each street, the board as it stood, and what
 * everybody did while looking at it.
 */

export const STREETS = ["preflop", "flop", "turn", "river"];

export const STREET_LABEL = {
  preflop: "Preflop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
};

// How much of the board was face up on each street.
const BOARD_SIZE = { preflop: 0, flop: 3, turn: 4, river: 5 };

/** The board as it stood on a given street. */
export function boardAt(communityCards, street) {
  return (communityCards || []).slice(0, BOARD_SIZE[street] ?? 0);
}

/**
 * The hand as a run of streets, each with its board and its actions.
 *
 * Only the streets that happened: a hand that ended on the flop has no turn,
 * and an empty heading is worse than no heading.
 */
export function streetsOf(hand) {
  return STREETS
    .map((street) => ({
      street,
      label: STREET_LABEL[street],
      board: boardAt(hand?.community_cards, street),
      // The cards this street turned over, so the flop can be told apart from
      // the one card that follows it.
      dealt: boardAt(hand?.community_cards, street)
        .slice(BOARD_SIZE[STREETS[STREETS.indexOf(street) - 1]] ?? 0),
      actions: (hand?.actions || []).filter((one) => one.street === street),
    }))
    .filter((group) => group.actions.length > 0 || group.dealt.length > 0);
}

/** Which seats took money out of this hand. */
export function winningSeats(hand) {
  return new Set((hand?.result?.awards || []).map((award) => award.seat));
}

/** Seat to name, which only the actions can say. */
export function namesBySeat(hand) {
  const names = new Map();
  for (const action of hand?.actions || []) {
    if (action.seat == null || names.has(action.seat)) continue;
    // What they are called, falling back to what they are filed under. A hand
    // history is people talking about a hand somebody played, and it should use
    // the name they play under.
    names.set(action.seat, action.display_name || action.username);
  }
  return names;
}

/**
 * The showdown, best hand first, so what won is at the top of the list rather
 * than wherever that player happened to be sitting.
 */
export function showdownOf(hand) {
  const winners = winningSeats(hand);
  return [...(hand?.result?.showdown || [])].sort((a, b) => (
    (winners.has(b.seat) ? 1 : 0) - (winners.has(a.seat) ? 1 : 0)
  ));
}

/** Whether a card was one of the five that made somebody's hand. */
export function isInBestFive(entry, card) {
  return Boolean(entry?.best_cards?.includes(card));
}
