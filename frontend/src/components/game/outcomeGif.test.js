import { describe, expect, it } from "vitest";

import { outcomeOf, pickIndex } from "./outcomeGif";

describe("outcomeOf", () => {
  it("knows a win from a cash from a bust", () => {
    expect(outcomeOf({ finishPosition: 1, inTheMoney: true })).toBe("won");
    // Winning is winning even where there is no money in it.
    expect(outcomeOf({ finishPosition: 1, inTheMoney: false })).toBe("won");
    expect(outcomeOf({ finishPosition: 3, inTheMoney: true })).toBe("cashed");
    expect(outcomeOf({ finishPosition: 9, inTheMoney: false })).toBe("busted");
  });
});

describe("pickIndex", () => {
  it("stays put for the same finish", () => {
    expect(pickIndex(42, 20)).toBe(pickIndex(42, 20));
  });

  it("keeps inside the list", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const index = pickIndex(seed, 7);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(7);
    }
  });

  it("sends neighbouring finishes somewhere different", () => {
    // Seeds here are consecutive places at the same tournament, so a hash that
    // walks in step would hand the whole table the same picture.
    const spread = new Set([1, 2, 3, 4, 5].map((place) => pickIndex(place, 20)));
    expect(spread.size).toBeGreaterThan(3);
  });

  it("survives an empty list", () => {
    expect(pickIndex(3, 0)).toBe(0);
  });
});
