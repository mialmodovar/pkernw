/**
 * Where the seats sit on the felt.
 *
 * Pure geometry, kept out of the component both so it can be tested — heads-up
 * facing each other is a promise worth pinning — and because a file that exports
 * anything but components loses fast refresh.
 *
 * Slots are laid out from the table's CAPACITY, not from the number of players
 * present, so nobody's seat shifts when someone busts.
 */

// Kept short of the container edges so a seat's full card/marker/nameplate
// stack still fits inside the table area instead of being covered by the
// action panel below.
//
// `power` bends the ellipse towards a stadium: below 1 it pushes slots off the
// arc and onto the long sides, which is what makes a tall phone table read as a
// poker table instead of a ring of nameplates.
export const PORTRAIT = { radiusX: 36, radiusY: 38, power: 0.7 };

// A few players on a table built for eight are a few people at opposite ends of
// an empty room, so the short-handed formats get felts of their own. The seat
// ring already puts seat 0 at the bottom and works round, which heads-up means
// one player at each end — front to front, the way two people actually sit down
// to play. These pull the felt in around them so it reads as that rather than as
// a nine-hander with seven empty chairs.
export const SHORT_TABLES = {
  // Heads up. Rounder and tighter than anything else here: two seats facing
  // each other across a small table is the whole picture.
  2: {
    portrait: { radiusX: 26, radiusY: 32, power: 1 },
    landscape: { radiusX: 26, radiusY: 34, power: 1 },
    compact: "inset-x-[20%] inset-y-[12%] rounded-[48%/34%]",
    wide: "inset-x-[30%] inset-y-[14%] rounded-[50%]",
  },
  // Three-handed, for the Spin n Go — which also gets the violet felt below.
  3: {
    portrait: { radiusX: 30, radiusY: 30, power: 0.85 },
    landscape: { radiusX: 32, radiusY: 33, power: 1 },
    compact: "inset-x-[16%] inset-y-[13%] rounded-[46%/32%]",
    wide: "inset-x-[24%] inset-y-[16%] rounded-[50%]",
  },
};

/**
 * Where the felt puts a plaque: something that sits there for the whole game
 * and belongs to the table rather than to a seat.
 *
 * The top-left corner, in percentages of the frame. Not the middle of the top
 * edge, which is where it used to be and which is the one place it must not
 * be: heads-up, the second seat is dead centre at the top, and everything that
 * hangs off that seat towards the board — the action it just took, most of all
 * — lands on exactly the same spot. There is a test that keeps every seat of
 * every table shape away from this corner.
 */
export const FELT_PLAQUE = { left: 2, top: 2 };

// How much room a seat takes around its centre, as percentages, for the test
// that keeps the corner above clear. Approximate on purpose: a seat is a
// column of a picture, a nameplate and whatever badges it is wearing, and the
// exact height depends on which of those it has at the time.
export const SEAT_FOOTPRINT = { width: 30, height: 30 };

// The shape a 5:3 table has always had, and the point at which the ring starts
// needing help.
export const CLASSIC_ASPECT = 5 / 3;

/** The seat ring for a table of a given width-to-height ratio.
 *
 * The frame is no longer a fixed 900×540: it fills the room it is given, so on
 * a wide window the felt is a long oval. Sampling an ellipse at equal angles
 * crowds the slots towards the two ends of its long axis, which on a stretched
 * table means clusters at the far left and right with nobody along the near and
 * far rails. The same bend the phone layout uses fixes it — pushed a little
 * harder the wider the table gets — and at the classic ratio nothing bends at
 * all, so an ordinary window looks exactly as it did.
 */
export function landscapeGeometry(aspect) {
  const stretch = Math.max(0, aspect - CLASSIC_ASPECT);
  return { radiusX: 42, radiusY: 38, power: Math.max(0.72, 1 - stretch * 0.28) };
}

function bend(value, power) {
  return power === 1 ? value : Math.sign(value) * Math.abs(value) ** power;
}

export function pointAt(index, capacity, scale, geometry) {
  const angle = (index / capacity) * 2 * Math.PI;
  const { radiusX, radiusY, power } = geometry;
  return {
    left: `${50 - radiusX * scale * bend(Math.sin(angle), power)}%`,
    top: `${50 + radiusY * scale * bend(Math.cos(angle), power)}%`,
  };
}

/**
 * Where one seat sits, as percentages of the frame.
 *
 * Index 0 is bottom-centre — the hero's chair, whoever that is — and the rest
 * run around the table towards the left. Heads-up that puts the two seats at
 * opposite ends of the felt, facing each other, which is how two people sit
 * down to play; there is a test on exactly that.
 *
 */
export function slotPosition(index, capacity, geometry) {
  if (capacity <= 0) return { top: "50%", left: "50%" };
  return pointAt(index, capacity, 1, geometry);
}
