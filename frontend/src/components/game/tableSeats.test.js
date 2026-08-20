import { describe, expect, it } from "vitest";

import { SHORT_TABLES, slotPosition } from "./tableSeats";

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
