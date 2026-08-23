import { describe, expect, it } from "vitest";

import { betPosition, boardHalfSpanPx, seatHalfSpanPx } from "./betSpots";
import { PORTRAIT, landscapeGeometry, pointAt } from "./tableSeats";

// An iPhone 12's table area: the frame is the width of the screen, less the
// bars above and below it.
const PHONE = { width: 390, height: 696, aspect: 390 / 696 };
const DESKTOP = { width: 1200, height: 620, aspect: 1200 / 620 };

/** Where a bet lands, in pixels from the middle of the frame. */
function offsetPx(spot, frame) {
  return {
    x: (parseFloat(spot.left) - 50) / 100 * frame.width,
    y: (parseFloat(spot.top) - 50) / 100 * frame.height,
  };
}

/**
 * Whether a bet's own box overlaps the community cards.
 *
 * The pill is not centred on the point it is given: PokerTable hangs it off
 * that point away from the pot — translate(-50 + 50 × towardsPot) — so a seat
 * on the side has its chips growing outwards and only the point itself is
 * near the board. Modelling it as centred is modelling a different component.
 */
function onTheBoard(spot, frame, compact) {
  const at = offsetPx(spot, frame);
  const board = boardHalfSpanPx(frame.width, compact);
  // The pill: a short wide thing, about this big at either size.
  const width = compact ? 60 : 88;
  const height = compact ? 20 : 28;
  const left = at.x + ((-50 + 50 * (spot.towardsPot ?? 0)) / 100) * width;
  const right = left + width;
  const overlapsX = right > -board.x && left < board.x;
  const overlapsY = Math.abs(at.y) < board.y + height / 2;
  return overlapsX && overlapsY;
}

describe("betPosition", () => {
  it("keeps every seat's chips off the community cards on a phone", () => {
    // The bug this was written for: at eight-handed, the two seats on the
    // sides had their chips sitting on the flop.
    for (const capacity of [2, 3, 4, 6, 8, 9]) {
      for (let seat = 0; seat < capacity; seat += 1) {
        const spot = betPosition(seat, capacity, PORTRAIT, PHONE, pointAt, true);
        expect(
          onTheBoard(spot, PHONE, true),
          `seat ${seat} of ${capacity} lands on the board`,
        ).toBe(false);
      }
    }
  });

  it("keeps them off the board on a wide table too", () => {
    const geometry = landscapeGeometry(DESKTOP.aspect);
    for (const capacity of [2, 6, 9]) {
      for (let seat = 0; seat < capacity; seat += 1) {
        const spot = betPosition(seat, capacity, geometry, DESKTOP, pointAt, false);
        expect(onTheBoard(spot, DESKTOP, false)).toBe(false);
      }
    }
  });

  it("still puts the chips between the player and the pot", () => {
    // Not behind them, and not past the middle: a bet that crossed the centre
    // would read as somebody else's.
    for (let seat = 0; seat < 8; seat += 1) {
      const seatAt = pointAt(seat, 8, 1, PORTRAIT);
      const spot = betPosition(seat, 8, PORTRAIT, PHONE, pointAt, true);
      const player = { x: parseFloat(seatAt.left) - 50, y: parseFloat(seatAt.top) - 50 };
      const chips = { x: parseFloat(spot.left) - 50, y: parseFloat(spot.top) - 50 };
      // Same side of the table as its owner, and no further out than them.
      expect(Math.sign(chips.x) === Math.sign(player.x) || Math.abs(player.x) < 1).toBe(true);
      expect(Math.hypot(chips.x, chips.y)).toBeLessThanOrEqual(Math.hypot(player.x, player.y) + 0.01);
    }
  });

  it("keeps a phone's chips off their owner's own cards too", () => {
    // The other half of the same squeeze: held back far enough to clear the
    // board, a side seat's chips landed back on the seat they came from.
    const seatHalf = seatHalfSpanPx(PHONE.width, true);
    for (const capacity of [2, 3, 6, 8]) {
      for (let seat = 0; seat < capacity; seat += 1) {
        const spot = betPosition(seat, capacity, PORTRAIT, PHONE, pointAt, true);
        const seatAt = pointAt(seat, capacity, 1, PORTRAIT);
        const from = {
          x: (parseFloat(spot.left) - parseFloat(seatAt.left)) / 100 * PHONE.width,
          y: (parseFloat(spot.top) - parseFloat(seatAt.top)) / 100 * PHONE.height,
        };
        const inside = Math.abs(from.x) < seatHalf.x && Math.abs(from.y) < seatHalf.y;
        expect(inside, `seat ${seat} of ${capacity} sits on its own cards`).toBe(false);
      }
    }
  });

  it("leaves a table with room to breathe exactly where it was", () => {
    // The lift is a phone's compromise. On a wide table the chips have never
    // needed it and must not start moving.
    const geometry = landscapeGeometry(DESKTOP.aspect);
    for (let seat = 0; seat < 9; seat += 1) {
      const spot = betPosition(seat, 9, geometry, DESKTOP, pointAt, false);
      const seatAt = pointAt(seat, 9, 1, geometry);
      const toSeat = { x: parseFloat(seatAt.left) - 50, y: parseFloat(seatAt.top) - 50 };
      const toChips = { x: parseFloat(spot.left) - 50, y: parseFloat(spot.top) - 50 };
      // Still on the line between the player and the middle of the table.
      const cross = toSeat.x * toChips.y - toSeat.y * toChips.x;
      expect(Math.abs(cross)).toBeLessThan(0.5);
    }
  });

  it("clears less on a phone than on a table with room", () => {
    expect(seatHalfSpanPx(390, true).x).toBeLessThan(seatHalfSpanPx(390, false).x);
  });

  it("gives the middle of the table back to nobody at all", () => {
    expect(betPosition(0, 0, PORTRAIT, PHONE, pointAt, true)).toEqual({ top: "50%", left: "50%" });
  });
});

describe("boardHalfSpanPx", () => {
  it("is smaller on a phone, where the cards themselves are", () => {
    expect(boardHalfSpanPx(390, true).x).toBeLessThan(boardHalfSpanPx(390, false).x);
  });

  it("leaves the side seats room to exist on a phone", () => {
    // Half the screen, less the board, has to fit a seat box.
    expect(boardHalfSpanPx(390, true).x).toBeLessThan(390 / 2 - 56);
  });
});
