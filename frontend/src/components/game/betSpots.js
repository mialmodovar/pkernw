/**
 * Where a player's chips sit while a hand is being played.
 *
 * Just in front of them, on the felt. Not a fraction of the way to the middle,
 * which is what this used to be: the table is an ellipse and it is wider than
 * it is tall, so scaling the radius put the chips of a seat on the side nearly
 * twice as far from their owner as the chips of a seat at the top — adrift
 * between the player and the pot, with whose bet they were no longer obvious.
 *
 * The step is taken in a space where one unit is the same distance on screen
 * both ways, since a percentage of the width and a percentage of the height are
 * not the same thing on a table this shape.
 *
 * Out of the component so it can be measured. A phone is 390 points wide and
 * everything on the felt has to fit between the two seats on the sides — which
 * it did not: the bets of the side seats were landing on the community cards,
 * because this was clearing a seat box the size of a desktop one.
 */

// How far in from a seat its chips sit, as a share of the table's height, so it
// is the same distance whichever way the seat lies.
export const BET_INSET = 26;

// The chip pill's own half-height, plus air between it and the seat. Generous
// on a table with room; a phone has none to give, and the felt between the
// seats and the board is where the argument happens.
export const BET_MARGIN = 40;
export const BET_MARGIN_COMPACT = 12;

/**
 * Half the room a seat takes up, in pixels, along each axis.
 *
 * A seat is not its face: it is a box of cards, a nameplate and a picture, and
 * PlayerSeat centres all of that on the point the ring puts it at. Clearing
 * only the avatar left the chips of a seat on the side sitting on its cards.
 *
 * These mirror the clamps in PlayerSeat and PlayingCard. They are estimates of
 * somebody else's CSS, so they are deliberately generous on a wide table: the
 * cost of being a little too clear is a chip stack sitting slightly further in.
 * On a phone the seat is a fixed size rather than a clamp, so the estimate is
 * simply that size — being generous there is what pushed the chips onto the
 * board.
 */
export function seatHalfSpanPx(frameWidth, compact = false) {
  if (compact) {
    // w-[6.5rem] beside a w-[6.75rem] hero, over cards that are h-[2.14rem] at
    // this width, plus the nameplate under them. A couple of points generous,
    // like the clamps below, and cheap to be: what it costs is chips sitting
    // slightly nearer their owner.
    return { x: 112 / 2, y: (34 + 38) / 2 };
  }
  const width = frameWidth || 0;
  // w-[clamp(8.75rem,27cqw,15rem)]
  const box = Math.min(240, Math.max(140, 0.27 * width));
  // The cards beside the face — h-[clamp(2.14rem,7.04cqw,4.69rem)] — over the
  // nameplate under it.
  const cards = Math.min(75, Math.max(34, 0.0704 * width));
  return { x: box / 2, y: (cards + 46) / 2 };
}

/**
 * Half the room the community cards take, in pixels.
 *
 * Five cards and the gaps between them, which on a phone is more than half the
 * width of the screen — the one thing on the felt that a bet must never be
 * allowed to reach. Mirrors the clamps in PlayingCard, plus a little air.
 */
export function boardHalfSpanPx(frameWidth, compact = false) {
  const width = frameWidth || 0;
  const card = compact
    ? Math.min(66, Math.max(31, 0.079 * width))
    : Math.min(66, Math.max(40, 0.0635 * width));
  const tall = compact
    ? Math.min(93, Math.max(43, 0.11 * width))
    : Math.min(93, Math.max(55, 0.0883 * width));
  // Five of them, four gaps, and room for the pot sitting under the row.
  return { x: (card * 5 + 16) / 2 + 6, y: tall / 2 + 14 };
}

/**
 * Where one seat's chips go, as percentages of the frame.
 *
 * Three things pull on the answer and the widest of them wins: a share of the
 * table, enough pixels to clear the seat itself, and — the one that is not
 * negotiable — staying off the board. On a phone the first two would happily
 * put a side seat's chips in the middle of the flop.
 */
export function betPosition(index, capacity, geometry, frame, pointAt, compact = false) {
  if (capacity <= 0) return { top: "50%", left: "50%" };

  const seat = pointAt(index, capacity, 1, geometry);
  const wide = Number.isFinite(frame?.aspect) && frame.aspect > 0 ? frame.aspect : 1;
  const x = (parseFloat(seat.left) - 50) * wide;
  const y = parseFloat(seat.top) - 50;

  const reach = Math.hypot(x, y);
  if (!reach) return { top: "50%", left: "50%" };

  const height = frame?.height || 0;
  const toPercent = (pixels) => (height ? (pixels / height) * 100 : 0);
  // Along the way it is travelling: a player on the side has a much wider box
  // between them and the pot than one at the top.
  const along = (span) => Math.abs(x / reach) * span.x + Math.abs(y / reach) * span.y;

  const margin = compact ? BET_MARGIN_COMPACT : BET_MARGIN;
  const clearsTheSeat = toPercent(along(seatHalfSpanPx(frame?.width, compact)) + margin);
  const clearsTheBoard = reach - toPercent(along(boardHalfSpanPx(frame?.width, compact)));

  // Never past the middle, and never onto the board. The board wins: chips a
  // player cannot tell from the flop are worse than chips anywhere else.
  const wanted = Math.max(BET_INSET, clearsTheSeat);
  const step = Math.max(0, Math.min(wanted, reach * 0.55, clearsTheBoard));

  // A seat directly beside the board on a phone has nowhere good to put its
  // chips: far enough in to clear its own cards is on the flop, and off the
  // flop is back on its cards. When the board has held them back like that,
  // they go over the seat instead of into it — straight up the felt, where at
  // eight handed there is nothing between that seat and the one above it.
  //
  // Only when they are already clear of the board sideways. At nine handed the
  // two side seats are not, and lifting them there would walk them onto the
  // very cards this is keeping them off; those chips stay put and overlap the
  // corner of their owner's own, which is the better of the two.
  const chipX = Math.abs(x - (x / reach) * step);
  const heldBack = wanted - step > toPercent(6);
  const clearSideways = chipX >= toPercent(boardHalfSpanPx(frame?.width, compact).x);
  // A seat exactly on the midline has no side of its own to be lifted away
  // from, and the two of them are mirror images: without snapping the sign
  // here, one of them went up and the other went down for no reason a player
  // could see.
  const side = Math.abs(y) < 0.001 ? 1 : Math.sign(y);
  const lift = heldBack && clearSideways
    ? -toPercent(seatHalfSpanPx(frame?.width, compact).y + margin) * side
    : 0;

  return {
    left: `${50 + (x - (x / reach) * step) / wide}%`,
    top: `${50 + (y - (y / reach) * step) + lift}%`,
    // Which way the pot lies, horizontally, so the chips can be hung off the
    // point rather than centred on it. The row of markers and the amount is
    // wide and short: centred, its far end reaches back over the face of the
    // player it belongs to.
    towardsPot: x / reach,
  };
}
