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
 * not the same thing on a table this shape. One unit of that space is one
 * hundredth of the frame's HEIGHT along either axis, which is why every pixel
 * figure below is converted before it is compared with `reach`.
 *
 * Out of the component so it can be measured.
 *
 * WHAT A PHONE HAS NOT GOT
 *
 * The real table frame on a phone is about 382 by 552 standing alone and 382 by
 * 436 in Safari with the bars showing: index.css pins .table-frame to the width
 * of the table area and to its height less 2rem, so a frame much taller than
 * one and a half times its width cannot happen, and a constant tuned against
 * one is tuned against nothing. In that frame, nine-handed, adjacent seat
 * centres are 82 to 93 pixels apart while a seat box is 112 by 72 and the board
 * is 183 wide. The felt between the board and the seat beside it is single
 * figures. There is no arrangement in which every seat's chips are at once off
 * the board, clear of their owner's own box, and unmistakably that seat's, so
 * the compact path picks in this order and gives the last two up on purpose:
 *
 *   1. (hard)     never on the community cards or the pot.
 *   2. (hard)     never nearer another seat's avatar than its own.
 *   3. (accepted) the pill may overlap its OWNER's own box. PokerTable draws
 *                 the bet layer under the seat layer on a phone so that when it
 *                 does, it reads as "my chips, at my seat" rather than as
 *                 something dropped on top of my cards.
 *   4. (accepted) a seat may stop shorter than it could have, to keep the ring
 *                 even — see BET_EVENNESS.
 *
 * The old code had the ordering backwards. It asked for a fixed 26% of the
 * frame's height first and consulted the board afterwards, and 26% of a real
 * phone is 115 to 181 pixels of travel where clearing your own box takes 48 to
 * 68 — so the hero's chips came to rest 115px in front of their own avatar and
 * 129px from seat 1's, and nine-handed on the short frame one seat's pill was
 * nine times nearer a neighbour's avatar than its owner's.
 */

// How far in from a seat its chips sit, as a share of the table's height, so it
// is the same distance whichever way the seat lies. Only a wide table has the
// felt for a figure like this; see the note above for why the phone does not
// use it.
export const BET_INSET = 26;

// The chip pill's own half-height, plus air between it and the seat. Generous
// on a table with room; a phone has none to give, and the felt between the
// seats and the board is where the argument happens.
export const BET_MARGIN = 40;

// The felt a phone leaves between a seat's box and its own chips, in pixels.
// Deliberately smaller than it looks like it ought to be: on a phone this is
// competing with the community cards for the same handful of points, and the
// gap is the first thing that should lose.
export const BET_GAP_COMPACT = 10;

// Slack in the ownership cap, in pixels. The cap lets the chips travel at most
// half the way to the nearest other seat; this takes a few pixels off that, so
// that a pill sitting exactly on the midpoint between two players — the one
// place where whose bet it is becomes a real question — cannot happen.
export const BET_CROWD_MARGIN = 5;

// How much further the luckiest seat at a table may step than the unluckiest.
// Every seat works out for itself how far it can go, and on a phone those
// answers are wildly different: at three-handed on a short frame the seat at
// the bottom has 62 points of clear felt in front of it and the two at the top
// have 16. Letting each take what it can get is a ring of chips at four
// different distances, which reads as four different kinds of bet. Holding the
// generous seats back to a multiple of the tightest one costs the hero forty
// points of felt nobody was using and buys a row of chips that all look like
// the same thing.
export const BET_EVENNESS = 1.5;

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
 * How big the chip pill itself is, in pixels.
 *
 * Measured off the row PokerTable actually renders rather than guessed at,
 * because both of the jobs this number does — clearing the owner's box and
 * clearing the board — are about the pill's edges and not about the point it
 * is anchored to. A pill modelled as a dot clears everything and sits on
 * everything.
 *
 * A ChipStack at size 9 is six 9px chips overlapping by 3 with a 1px edge under
 * them: 25 tall and a shade over 10 wide. The pill puts py-0.5 and a border
 * around that, so 32 tall. Across, px-1 and the border and a gap-0.5 and a 12px
 * bold amount come to about 56, and the dealer or blind disc beside it — 0.85rem
 * at this container width — with its own gap brings the row to 64. A wide table
 * draws the same row with a bigger disc and room for a longer figure.
 */
export function betPillPx(compact = false) {
  return compact ? { x: 64, y: 32 } : { x: 96, y: 32 };
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
  //
  // On a phone that row is not the half of it. What PokerTable centres on the
  // middle of the frame is a column: the cards, a 4px gap, the pot — whose own
  // chip stack alone is 36 tall — another gap, and the line naming the hand you
  // are holding. Measured against the real markup at a 382px frame that column
  // is about 97 tall, so half of it is 48 and not the 35 that a flat +14 was
  // claiming. The bets of the seats above and below were being cleared past the
  // cards and landing on the pot bubble underneath them.
  return { x: (card * 5 + 16) / 2 + 6, y: tall / 2 + (compact ? 26 : 14) };
}

/**
 * The seat ring in the isotropic space, in whole-frame units.
 *
 * One unit is a hundredth of the frame's height on either axis, so distances
 * between seats mean the same thing whichever way round the table they lie.
 */
function seatVector(index, capacity, geometry, pointAt, wide) {
  const seat = pointAt(index, capacity, 1, geometry);
  return {
    x: (parseFloat(seat.left) - 50) * wide,
    y: parseFloat(seat.top) - 50,
  };
}

/**
 * How far one seat's chips could travel on a phone, in pixels, before they hit
 * something that matters.
 *
 * Four caps, and the tightest of them wins — which is the whole difference from
 * the wide table, where three wants compete and the greediest of them wins.
 * Every one of these is a ceiling: there is no floor anywhere in here, because
 * on a phone there is no distance that is always available.
 *
 * Separated out because betPosition has to ask it about every OTHER seat as
 * well as about this one, to keep the ring even. Nine seats and a dozen
 * multiplications each; the loop it costs is not worth caching.
 */
function compactCapPx(index, capacity, geometry, frame, pointAt, wide) {
  const height = frame?.height || 0;
  const { x, y } = seatVector(index, capacity, geometry, pointAt, wide);
  const reach = Math.hypot(x, y);
  if (!reach || !height) return 0;

  // Units of the isotropic space are a hundredth of the frame's height, both
  // ways round, so this is the only conversion the whole function needs.
  const toPx = (units) => (units * height) / 100;
  // The inward unit vector. Either component can be exactly zero — a seat dead
  // centre at the top has no sideways travel at all — and dividing by that is
  // how chips end up at Infinity per cent.
  const inward = { x: -x / reach, y: -y / reach };
  const acrossX = Math.abs(inward.x);
  const acrossY = Math.abs(inward.y);
  const seatHalf = seatHalfSpanPx(frame?.width, true);
  const board = boardHalfSpanPx(frame?.width, true);
  const pill = betPillPx(true);

  // (1) Far enough to be clear of my own box, and no further — going past that
  // buys nothing and spends felt the board wants. The pill hangs outward from
  // its anchor (see `towardsPot`), so travelling sideways has to cover the two
  // half-widths and then the half-pill that hangs back over them. Either axis
  // on its own is enough to be clear: a seat at the top only has to come down
  // past its own nameplate, a seat on the side only in past its own cards.
  const clearsMineY = acrossY > 1e-6
    ? (seatHalf.y + BET_GAP_COMPACT + pill.y / 2) / acrossY
    : Infinity;
  const clearsMineX = acrossX > 1e-6
    ? pill.x / 2 + (seatHalf.x + BET_GAP_COMPACT + pill.x / 2) / acrossX
    : Infinity;

  // (2) Never nearer somebody else's avatar than my own. This is the cap that
  // made the old "park it beside them" branch unnecessary: that branch shoved a
  // crowded seat down AND in, which nine-handed left seat 3's pill 30px from
  // seat 4's face and 57px from its owner's. There is no clever direction to
  // push chips in when the felt is full — the answer is to stop them short, and
  // half the way to the nearest neighbour, less a few pixels, is as far as
  // "short" can go and still be honest about whose money it is.
  let nearest = Infinity;
  for (let other = 0; other < capacity; other += 1) {
    if (other === index) continue;
    const at = seatVector(other, capacity, geometry, pointAt, wide);
    nearest = Math.min(nearest, Math.hypot(x - at.x, y - at.y));
  }
  const ownsMine = Number.isFinite(nearest)
    ? toPx(nearest) / 2 - BET_CROWD_MARGIN
    : Infinity;

  // (3) Off the board, the one that is not negotiable — and measured against
  // the pill's leading edge, since an anchor that clears the flop by a pixel is
  // an anchor with two thirds of a chip pill lying on it.
  //
  // Not the same sum on both axes, because the pill is not centred on its
  // anchor. Hung fully outward it reaches no further in than the anchor itself,
  // so a seat on the side may bring its anchor right up to the edge of the
  // cards; a seat at the top, whose pill is centred, has to stop half a pill
  // short. Modelling it as a centred box lost the side seats 30 points of the
  // only felt they had.
  const boardX = acrossX > 1e-6
    ? (toPx(Math.abs(x)) - board.x - (pill.x / 2) * (1 - acrossX)) / acrossX
    : -Infinity;
  const boardY = acrossY > 1e-6
    ? (toPx(Math.abs(y)) - board.y - pill.y / 2) / acrossY
    : -Infinity;
  // Either axis clear of the board is clear of the board, so the further of the
  // two is the real limit.
  const clearsTheBoard = Math.max(boardX, boardY);

  // (4) Never past the middle of the table. A backstop rather than a rule now:
  // with the three above in force nothing gets near the centre, but heads-up
  // the felt is small enough that it is still worth saying.
  const backstop = toPx(reach) * 0.55;

  return Math.max(0, Math.min(
    Math.min(clearsMineX, clearsMineY),
    ownsMine,
    clearsTheBoard,
    backstop,
  ));
}

/**
 * Where one seat's chips go, as percentages of the frame.
 *
 * On a wide table three things pull on the answer and the widest of them wins:
 * a share of the table, enough pixels to clear the seat itself, and — the one
 * that is not negotiable — staying off the board.
 *
 * On a phone none of that survives contact with the felt, so the compact path
 * takes the smallest of four ceilings instead of the largest of three wants,
 * and then holds the roomier seats back to keep the ring even. See the note at
 * the top of this file for what that gives up and why.
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

  let step;
  if (compact) {
    // What every seat at this table could take, so that this one can decline to
    // take more than its share. Before the frame has been measured there is
    // nothing any of this can be worked out against, so the chips wait at the
    // seat for one paint rather than guessing.
    let tightest = Infinity;
    for (let other = 0; other < capacity; other += 1) {
      tightest = Math.min(tightest, compactCapPx(other, capacity, geometry, frame, pointAt, wide));
    }
    const mine = compactCapPx(index, capacity, geometry, frame, pointAt, wide);
    step = toPercent(Math.min(mine, BET_EVENNESS * tightest));
  } else {
    const clearsTheSeat = toPercent(along(seatHalfSpanPx(frame?.width, false)) + BET_MARGIN);
    const clearsTheBoard = reach - toPercent(along(boardHalfSpanPx(frame?.width, false)));

    // Never past the middle, and never onto the board. The board wins: chips a
    // player cannot tell from the flop are worse than chips anywhere else.
    const wanted = Math.max(BET_INSET, clearsTheSeat);
    step = Math.max(0, Math.min(wanted, reach * 0.55, clearsTheBoard));
  }

  return {
    left: `${50 + (x - (x / reach) * step) / wide}%`,
    top: `${50 + (y - (y / reach) * step)}%`,
    // Which way its owner lies, horizontally, so the pill can be hung off the
    // anchor rather than centred on it. The row of markers and the amount is
    // wide and short: centred on a side seat's anchor its inner end reaches
    // over the board, so it is hung the other way and its mass stays on its
    // owner's half of the felt. On a phone that is also the only reason a side
    // seat has any room at all — the anchor may go right up to the edge of the
    // cards, because nothing is hanging off that side of it.
    towardsPot: x / reach,
  };
}
