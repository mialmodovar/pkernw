import { describe, expect, it } from "vitest";

import {
  FELT_PLAQUE, SEAT_FOOTPRINT, SHORT_TABLES, landscapeGeometry, slotPosition,
} from "./tableSeats";

const percent = (value) => Number.parseFloat(value);

describe("the heads-up seat ring", () => {
  const geometry = SHORT_TABLES[2].landscape;

  it("puts the two players front to front", () => {
    const hero = slotPosition(0, 2, geometry);
    const villain = slotPosition(1, 2, geometry);

    // Same column, opposite ends: one at the near rail and one at the far one,
    // which is what "heads up" looks like at a real table.
    expect(percent(hero.left)).toBeCloseTo(50, 5);
    expect(percent(villain.left)).toBeCloseTo(50, 5);
    expect(percent(hero.top)).toBeGreaterThan(50);
    expect(percent(villain.top)).toBeLessThan(50);
    // Equally far from the middle, so neither seat is closer to the board.
    expect(percent(hero.top) - 50).toBeCloseTo(50 - percent(villain.top), 5);
  });

  it("keeps both seats on the felt", () => {
    for (const index of [0, 1]) {
      const seat = slotPosition(index, 2, geometry);
      expect(percent(seat.top)).toBeGreaterThan(0);
      expect(percent(seat.top)).toBeLessThan(100);
      expect(percent(seat.left)).toBeGreaterThan(0);
      expect(percent(seat.left)).toBeLessThan(100);
    }
  });

  it("has a phone layout that is also front to front", () => {
    const hero = slotPosition(0, 2, SHORT_TABLES[2].portrait);
    const villain = slotPosition(1, 2, SHORT_TABLES[2].portrait);

    expect(percent(hero.left)).toBeCloseTo(percent(villain.left), 5);
    expect(percent(hero.top)).toBeGreaterThan(percent(villain.top));
  });
});

describe("the three-handed seat ring", () => {
  it("spreads three players evenly, hero at the bottom", () => {
    const geometry = SHORT_TABLES[3].landscape;
    const seats = [0, 1, 2].map((index) => slotPosition(index, 3, geometry));

    expect(percent(seats[0].left)).toBeCloseTo(50, 5);
    expect(percent(seats[0].top)).toBeGreaterThan(50);
    // The other two sit above, one either side.
    expect(percent(seats[1].top)).toBeLessThan(50);
    expect(percent(seats[2].top)).toBeLessThan(50);
    expect(percent(seats[1].left)).toBeLessThan(50);
    expect(percent(seats[2].left)).toBeGreaterThan(50);
  });
});

describe("where the felt puts a plaque", () => {
  // Every table shape the app deals, and both orientations of the short ones.
  const shapes = [
    ["heads up", 2, SHORT_TABLES[2].landscape],
    ["heads up, phone", 2, SHORT_TABLES[2].portrait],
    ["three handed", 3, SHORT_TABLES[3].landscape],
    ["three handed, phone", 3, SHORT_TABLES[3].portrait],
    ["six max", 6, landscapeGeometry(5 / 3)],
    ["nine max", 9, landscapeGeometry(5 / 3)],
    ["nine max, wide", 9, landscapeGeometry(21 / 9)],
  ];

  it.each(shapes)("keeps every seat clear of the corner: %s", (_name, seats, geometry) => {
    for (let index = 0; index < seats; index += 1) {
      const seat = slotPosition(index, seats, geometry);
      const apart = {
        x: Math.abs(percent(seat.left) - FELT_PLAQUE.left),
        y: Math.abs(percent(seat.top) - FELT_PLAQUE.top),
      };
      // Clear on one axis is clear: a seat directly below the corner and a
      // long way down does not touch it.
      const clash = apart.x < SEAT_FOOTPRINT.width / 2 && apart.y < SEAT_FOOTPRINT.height / 2;
      expect(clash, `seat ${index} at ${seat.left},${seat.top}`).toBe(false);
    }
  });

  it("is not the middle of the top edge, which is a seat heads-up", () => {
    // The bug this replaces: the prize sat at 50% across and a quarter of the
    // way down, and heads-up that is where the opponent and everything hanging
    // off their seat lives.
    const villain = slotPosition(1, 2, SHORT_TABLES[2].landscape);
    expect(percent(villain.left)).toBe(50);
    expect(FELT_PLAQUE.left).toBeLessThan(20);
  });
});
