import { describe, expect, it } from "vitest";

import { betPillPx, betPosition, boardHalfSpanPx, seatHalfSpanPx } from "./betSpots";
import { PORTRAIT, SHORT_TABLES, landscapeGeometry, pointAt } from "./tableSeats";

/**
 * The table area on a phone, as the CSS can actually produce it.
 *
 * `.table-frame` is `width: 100%; height: calc(100% - 2rem)` inside `.table-area`,
 * which is the page less the header strip and less the action band below the
 * felt. So the frame is the screen's width minus the area's padding, and a good
 * deal shorter than the screen.
 *
 * These used to be 390×696, which is a frame no phone can produce — it would
 * need a viewport about 940 points tall. Every percentage-of-height constant in
 * betSpots.js was therefore tuned against a table 26–60% taller than the real
 * one, which is most of why the chips ended up halfway to the pot. The guard
 * below is here so nobody re-pins an impossible frame by accident.
 */
const PHONE = { width: 382, height: 552, aspect: 382 / 552 };
// The same phone in a browser that is still showing its own bars.
const SHORT_PHONE = { width: 382, height: 436, aspect: 382 / 436 };
const PHONES = [PHONE, SHORT_PHONE];
const DESKTOP = { width: 1200, height: 620, aspect: 1200 / 620 };

// Every capacity the felt is laid for, not the sparse handful this used to
// check — 5-, 7- and 9-handed were never covered and 7-max is where the
// tightest ratios live.
const CAPACITIES = [2, 3, 4, 5, 6, 7, 8, 9];

/** The ring a table of this size uses on a phone. */
const ringFor = (capacity) => SHORT_TABLES[capacity]?.portrait || PORTRAIT;

/** A seat's centre, in pixels from the middle of the frame. */
function seatPx(index, capacity, geometry, frame) {
  const at = pointAt(index, capacity, 1, geometry);
  return {
    x: ((parseFloat(at.left) - 50) / 100) * frame.width,
    y: ((parseFloat(at.top) - 50) / 100) * frame.height,
  };
}

/** Where the chips are anchored, in pixels from the middle of the frame. */
function anchorPx(spot, frame) {
  return {
    x: ((parseFloat(spot.left) - 50) / 100) * frame.width,
    y: ((parseFloat(spot.top) - 50) / 100) * frame.height,
  };
}

/**
 * The middle of the pill as it is actually drawn.
 *
 * PokerTable hangs it off the anchor rather than centring it on the anchor —
 * `translate(-50 + 50 × towardsPot, -50)` — so a seat on the side has its
 * chips growing outwards and only the anchor itself comes near the board.
 * Modelling it as centred is modelling a different component.
 */
function pillCentrePx(spot, frame, compact) {
  const at = anchorPx(spot, frame);
  const pill = betPillPx(compact);
  return { x: at.x + ((spot.towardsPot ?? 0) * pill.x) / 2, y: at.y };
}

/**
 * Whether the pill's own box overlaps the community cards.
 *
 * A pixel of slack, because the caps in betSpots.js are written to spend every
 * point of felt there is: a crowded seat's chips come to rest exactly against
 * the modelled board box, and whether that lands a rounding error inside or
 * outside is not a thing worth pinning. The box itself is drawn well outside
 * the cards — boardHalfSpanPx pads it by 26 points for the pot bubble and the
 * hand-read line — so touching it is nowhere near touching a card.
 */
function onTheBoard(spot, frame, compact) {
  const at = pillCentrePx(spot, frame, compact);
  const board = boardHalfSpanPx(frame.width, compact);
  const pill = betPillPx(compact);
  return Math.abs(at.x) < board.x + pill.x / 2 - 1
    && Math.abs(at.y) < board.y + pill.y / 2 - 1;
}

/**
 * Whether the board has already swallowed this seat.
 *
 * On a narrow phone some seats have no felt in front of them at all: the seat's
 * own box and the board's overlap each other before a single chip is drawn. A
 * pure side seat four-handed sits 137px out from the middle with a 56px
 * half-width, so its box reaches to 81px — and the board reaches 91px. There
 * are minus ten points of felt between them.
 *
 * Those seats cannot be given chips that are both off the board and off their
 * owner, and the felt decides which: the board is the hard rule, so the chips
 * end up lying over their owner. The tests below hold every other seat to the
 * full promise and let these ones off it, rather than quietly weakening the
 * promise for all nine.
 */
function boardHasSwallowed(index, capacity, geometry, frame) {
  const seat = seatPx(index, capacity, geometry, frame);
  const board = boardHalfSpanPx(frame.width, true);
  const half = seatHalfSpanPx(frame.width, true);
  return Math.abs(seat.x) - half.x < board.x && Math.abs(seat.y) - half.y < board.y;
}

describe("betPosition", () => {
  it("pins phone frames the CSS can actually produce", () => {
    // A frame taller than this against its width cannot come out of
    // `.table-frame` on any phone in use. See the note above.
    for (const frame of PHONES) {
      expect(frame.height).toBeLessThanOrEqual(frame.width * 1.6);
    }
  });

  it("keeps every seat's chips off the community cards on a phone", () => {
    // The bug this was written for: at eight-handed, the two seats on the
    // sides had their chips sitting on the flop.
    for (const frame of PHONES) {
      for (const capacity of CAPACITIES) {
        for (let seat = 0; seat < capacity; seat += 1) {
          const spot = betPosition(seat, capacity, ringFor(capacity), frame, pointAt, true);
          expect(
            onTheBoard(spot, frame, true),
            `seat ${seat} of ${capacity} lands on the board at ${frame.width}×${frame.height}`,
          ).toBe(false);
        }
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

  it("never puts a seat's chips nearer somebody else's face than its own", () => {
    // The complaint this whole rewrite is for: "sometimes my bet looks closer
    // to the opponent's avatar than to mine". It was not a trick of the eye.
    // The old code scored 0.53 here — nine-handed on a short frame, seat 3's
    // chips sat 30px from seat 4's face and 57px from their owner's — and its
    // own hero, whose chips were 115px out in front, scored 1.11.
    //
    // The margin is deliberately well under what the code manages (1.59 at its
    // worst, seven-handed) so the test says "unambiguous" rather than pinning
    // an exact geometry nobody may touch.
    for (const frame of PHONES) {
      for (const capacity of CAPACITIES) {
        const geometry = ringFor(capacity);
        for (let seat = 0; seat < capacity; seat += 1) {
          const spot = betPosition(seat, capacity, geometry, frame, pointAt, true);
          const chips = pillCentrePx(spot, frame, true);
          const own = seatPx(seat, capacity, geometry, frame);
          const toOwn = Math.hypot(chips.x - own.x, chips.y - own.y);

          for (let other = 0; other < capacity; other += 1) {
            if (other === seat) continue;
            const at = seatPx(other, capacity, geometry, frame);
            const toOther = Math.hypot(chips.x - at.x, chips.y - at.y);
            expect(
              toOther,
              `seat ${seat} of ${capacity} at ${frame.width}×${frame.height}: `
              + `${toOwn.toFixed(0)}px from its owner, ${toOther.toFixed(0)}px from seat ${other}`,
            ).toBeGreaterThan(toOwn * 1.25);
          }
        }
      }
    }
  });

  it("steps about as far in front of one seat as it does in front of the next", () => {
    // A ring of chips at four different distances reads as four different
    // kinds of bet. Each seat works out for itself how much felt it has, and
    // on a phone those answers are wildly different, so the roomy seats are
    // held back to a multiple of the tightest — see BET_EVENNESS.
    for (const frame of PHONES) {
      for (const capacity of CAPACITIES) {
        const geometry = ringFor(capacity);
        const steps = Array.from({ length: capacity }, (_, seat) => {
          const spot = betPosition(seat, capacity, geometry, frame, pointAt, true);
          const at = anchorPx(spot, frame);
          const own = seatPx(seat, capacity, geometry, frame);
          return Math.hypot(at.x - own.x, at.y - own.y);
        });
        const spread = Math.max(...steps) / Math.min(...steps);
        expect(
          spread,
          `${capacity}-handed at ${frame.width}×${frame.height}: `
          + steps.map((one) => one.toFixed(0)).join(" / "),
        ).toBeLessThanOrEqual(1.6);
      }
    }
  });

  it("puts the chips on the line between the player and the pot, at every size", () => {
    // The single assertion that makes the old bug unrepresentable. The chips
    // used to be allowed to leave that line: a seat the board had crowded out
    // had them shoved sideways to "park" beside their owner, which moved them
    // down AND in and landed them on the next player along. There is nowhere
    // good to push chips when the felt is full — the answer is to stop them
    // short, which is what the caps in betSpots.js now do.
    const cases = [
      ...PHONES.map((frame) => ({ frame, compact: true })),
      { frame: DESKTOP, compact: false },
    ];
    for (const { frame, compact } of cases) {
      for (const capacity of CAPACITIES) {
        const geometry = compact ? ringFor(capacity) : landscapeGeometry(frame.aspect);
        for (let seat = 0; seat < capacity; seat += 1) {
          const spot = betPosition(seat, capacity, geometry, frame, pointAt, compact);
          const at = pointAt(seat, capacity, 1, geometry);
          const toSeat = { x: parseFloat(at.left) - 50, y: parseFloat(at.top) - 50 };
          const toChips = { x: parseFloat(spot.left) - 50, y: parseFloat(spot.top) - 50 };
          const cross = toSeat.x * toChips.y - toSeat.y * toChips.x;
          expect(
            Math.abs(cross),
            `seat ${seat} of ${capacity} at ${frame.width}×${frame.height} is off its own line`,
          ).toBeLessThan(0.5);
        }
      }
    }
  });

  it("still puts the chips between the player and the pot", () => {
    // Not behind them, and not past the middle: a bet that crossed the centre
    // would read as somebody else's.
    for (const frame of PHONES) {
      for (const capacity of CAPACITIES) {
        const geometry = ringFor(capacity);
        for (let seat = 0; seat < capacity; seat += 1) {
          const at = pointAt(seat, capacity, 1, geometry);
          const spot = betPosition(seat, capacity, geometry, frame, pointAt, true);
          const player = { x: parseFloat(at.left) - 50, y: parseFloat(at.top) - 50 };
          const chips = { x: parseFloat(spot.left) - 50, y: parseFloat(spot.top) - 50 };
          // Same side of the table as its owner, and no further out than them.
          expect(Math.sign(chips.x) === Math.sign(player.x) || Math.abs(player.x) < 1).toBe(true);
          expect(Math.hypot(chips.x, chips.y))
            .toBeLessThanOrEqual(Math.hypot(player.x, player.y) + 0.01);
        }
      }
    }
  });

  it("keeps a phone's chips off their owner's own face", () => {
    // The other half of the squeeze. This used to demand the chips clear the
    // whole seat BOX — cards, nameplate and all — which on a nine-handed phone
    // is not a thing the felt can give: adjacent seats are 82–93px apart and a
    // seat box is 112×72, so the seats overlap each other before any chips are
    // drawn. Demanding it is what forced the parking hack that caused the bug.
    //
    // So the promise is smaller now, and honest: chips may lie over the edge of
    // their owner's own cards, but never over their face. Sitting on your own
    // cards reads as "my chips are at my seat"; sitting on the next player's
    // reads as their bet. PokerTable also drops the bet layer under the seats
    // on a phone, so the overlap goes behind rather than over.
    //
    // Every seat except the ones the board has already swallowed, which have no
    // felt to be clear in — see boardHasSwallowed.
    const FACE = 20;
    for (const frame of PHONES) {
      for (const capacity of CAPACITIES) {
        const geometry = ringFor(capacity);
        for (let seat = 0; seat < capacity; seat += 1) {
          if (boardHasSwallowed(seat, capacity, geometry, frame)) continue;
          const spot = betPosition(seat, capacity, geometry, frame, pointAt, true);
          const chips = pillCentrePx(spot, frame, true);
          const own = seatPx(seat, capacity, geometry, frame);
          const inside = Math.abs(chips.x - own.x) < FACE && Math.abs(chips.y - own.y) < FACE;
          expect(
            inside,
            `seat ${seat} of ${capacity} sits on its own face at ${frame.width}×${frame.height}`,
          ).toBe(false);
        }
      }
    }
  });

  it("puts the chips on the pot side of the player they belong to", () => {
    // Chips behind their owner are chips at the rail, which is where a player
    // who has folded pushes them. In front means nearer the middle of the
    // table than the player is — the whole point of the row.
    //
    // Again, except where the board has swallowed the seat: there the pill
    // hangs outward off an anchor that could barely move, which can carry its
    // middle a few points back past the player. Nothing better is available,
    // and the ownership rule above still holds there.
    for (const frame of PHONES) {
      for (const capacity of CAPACITIES) {
        const geometry = ringFor(capacity);
        for (let seat = 0; seat < capacity; seat += 1) {
          if (boardHasSwallowed(seat, capacity, geometry, frame)) continue;
          const spot = betPosition(seat, capacity, geometry, frame, pointAt, true);
          const chips = pillCentrePx(spot, frame, true);
          const own = seatPx(seat, capacity, geometry, frame);
          expect(
            Math.hypot(chips.x, chips.y),
            `seat ${seat} of ${capacity} at ${frame.width}×${frame.height} sits behind its owner`,
          ).toBeLessThan(Math.hypot(own.x, own.y));
        }
      }
    }
  });

  it("leaves a table with room to breathe exactly where it was", () => {
    // The compact path is a phone's compromise and none of it may leak out
    // here. These are the numbers the wide table has always drawn, to four
    // decimal places, so any future work on the phone that moves the desktop
    // fails loudly instead of quietly.
    const WIDE_9 = [
      [50.0000, 67.1000],
      [34.8181, 66.1552],
      [22.2911, 55.0373],
      [27.0208, 37.4898],
      [41.3446, 30.0604],
      [58.6554, 30.0604],
      [72.9792, 37.4898],
      [77.7089, 55.0373],
      [65.1819, 66.1552],
    ];
    const geometry = landscapeGeometry(DESKTOP.aspect);
    WIDE_9.forEach(([left, top], seat) => {
      const spot = betPosition(seat, 9, geometry, DESKTOP, pointAt, false);
      expect(parseFloat(spot.left), `seat ${seat} left`).toBeCloseTo(left, 3);
      expect(parseFloat(spot.top), `seat ${seat} top`).toBeCloseTo(top, 3);
    });
  });

  it("sits the two of them opposite each other heads-up", () => {
    // Heads-up both seats are on the vertical axis, so both step straight
    // towards the middle and neither has any sideways travel at all.
    for (const frame of PHONES) {
      for (const seat of [0, 1]) {
        const spot = betPosition(seat, 2, SHORT_TABLES[2].portrait, frame, pointAt, true);
        expect(parseFloat(spot.left)).toBeCloseTo(50, 5);
        expect(spot.towardsPot).toBeCloseTo(0, 5);
      }
    }
  });

  it("leaves the near seat's chips squarely in front of the near seat", () => {
    // Yours come straight up the middle: nothing to either side of the seat at
    // the bottom, so nothing to hang the pill off.
    for (const frame of PHONES) {
      const at = pointAt(0, 9, 1, PORTRAIT);
      const spot = betPosition(0, 9, PORTRAIT, frame, pointAt, true);
      expect(parseFloat(spot.left)).toBeCloseTo(parseFloat(at.left), 5);
      expect(parseFloat(spot.top)).toBeLessThan(parseFloat(at.top));
    }
  });

  it("clears less on a phone than on a table with room", () => {
    expect(seatHalfSpanPx(390, true).x).toBeLessThan(seatHalfSpanPx(390, false).x);
  });

  it("gives the middle of the table back to nobody at all", () => {
    expect(betPosition(0, 0, PORTRAIT, PHONE, pointAt, true)).toEqual({ top: "50%", left: "50%" });
  });
});

describe("betPillPx", () => {
  it("is smaller on a phone, where the chips and the type are", () => {
    expect(betPillPx(true).x).toBeLessThan(betPillPx(false).x);
  });

  it("is wider than it is tall, which is why it has to be hung off its anchor", () => {
    const pill = betPillPx(true);
    expect(pill.x).toBeGreaterThan(pill.y);
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

  it("covers the pot and the hand-read line, not just the cards", () => {
    // The column in the middle of the felt is the five cards, the pot bubble
    // under them and the line naming your hand under that. Modelling only the
    // cards is what let a top seat's chips land on the pot.
    const cards = Math.min(93, Math.max(43, 0.11 * 382));
    expect(boardHalfSpanPx(382, true).y).toBeGreaterThan(cards / 2 + 20);
  });
});
