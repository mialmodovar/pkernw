/**
 * What each seat's position is called, counted round from the button.
 *
 * The dealer button, the small blind and the big blind are marked on the felt,
 * next to the chips they cost — but every other seat has a position too, and
 * "I'm under the gun" is the thing a player actually needs to know before they
 * look at their cards. This gives every seat in the hand its name.
 *
 * Only seats dealt into the hand are counted. Somebody sitting out is not in
 * anyone's position, and counting them would move everybody else's.
 */

// The seats between the big blind and the button, listed in the order they act
// before the flop. Spelled out per table size rather than derived, because the
// short-handed names are conventions and not a formula — five-handed goes
// straight from under the gun to the cutoff, with no hijack in between.
const MIDDLE = {
  0: [],
  1: ["CO"],
  2: ["UTG", "CO"],
  3: ["UTG", "HJ", "CO"],
  4: ["UTG", "UTG+1", "HJ", "CO"],
  5: ["UTG", "UTG+1", "MP", "HJ", "CO"],
  6: ["UTG", "UTG+1", "MP", "LJ", "HJ", "CO"],
  7: ["UTG", "UTG+1", "UTG+2", "MP", "LJ", "HJ", "CO"],
};

// The four names nearest the button keep their own labels at any size; anything
// earlier than that is numbered off under the gun.
const NEAR_BUTTON = ["MP", "LJ", "HJ", "CO"];

function middleLabels(count) {
  if (MIDDLE[count]) return MIDDLE[count];
  const early = Array.from(
    { length: count - NEAR_BUTTON.length },
    (_, index) => (index === 0 ? "UTG" : `UTG+${index}`),
  );
  return [...early, ...NEAR_BUTTON];
}

const HINTS = {
  BTN: "on the button — last to act after the flop",
  SB: "small blind — first to act after the flop",
  BB: "big blind — last to act before the flop",
  UTG: "under the gun — first to act before the flop",
  MP: "middle position",
  LJ: "lojack — three seats before the button",
  HJ: "hijack — two seats before the button",
  CO: "cutoff — one seat before the button",
};

/** The sentence behind a label, for the tooltip on it. */
export function positionHint(label) {
  if (!label) return null;
  return HINTS[label] || (label.startsWith("UTG+") ? "early position" : null);
}

/**
 * A Map of seat number → position label.
 *
 * `seats` are the seats dealt into the hand, in seat order; `dealerSeat` is the
 * one with the button. Returns an empty Map when the button is not among them,
 * which is the state between hands — better nothing than a set of labels that
 * are about to change.
 */
export default function positionLabels(seats, dealerSeat) {
  const labels = new Map();
  if (!Array.isArray(seats) || seats.length === 0) return labels;
  if (dealerSeat == null || !seats.includes(dealerSeat)) return labels;

  const start = seats.indexOf(dealerSeat);
  const order = seats.map((_, index) => seats[(start + index) % seats.length]);

  // Heads-up, the button posts the small blind. It is labelled as the button
  // because that is the part that decides how the hand plays; the blind it also
  // posts is on the felt, under its chips.
  const names = order.length <= 2
    ? ["BTN", "BB"]
    : ["BTN", "SB", "BB", ...middleLabels(order.length - 3)];

  order.forEach((seat, index) => {
    if (names[index]) labels.set(seat, names[index]);
  });
  return labels;
}
