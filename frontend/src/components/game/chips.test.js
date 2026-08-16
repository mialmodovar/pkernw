import { describe, expect, it } from "vitest";

import { DENOMINATIONS, MAX_CHIPS, chipLean, chipMetrics, chipsFor } from "./chips";

const values = (amount) => chipsFor(amount).map((chip) => chip.value);

describe("chipsFor", () => {
  it("uses the biggest denominations that fit", () => {
    expect(values(1130)).toEqual([1000, 100, 25, 5]);
  });

  it("draws nothing for nothing", () => {
    expect(chipsFor(0)).toEqual([]);
  });

  it("draws something for an amount smaller than any chip", () => {
    // Blinds start below the smallest denomination in plenty of structures, and
    // a live bet with no chips in front of it reads as no bet at all.
    expect(values(0.5)).toEqual([1]);
  });

  it("stops at six however big the pot is", () => {
    expect(chipsFor(400000)).toHaveLength(MAX_CHIPS);
    expect(values(400000)).toEqual([5000, 5000, 5000, 5000, 5000, 5000]);
  });

  it("puts the big chips out first when it has to truncate", () => {
    // What a capped stack is really saying is "the big chips are out", so the
    // truncation has to fall on the small ones.
    expect(values(5555)[0]).toBe(5000);
  });
});

describe("the denominations themselves", () => {
  it("runs largest first, which is what the greedy fill assumes", () => {
    const ordered = [...DENOMINATIONS].sort((a, b) => b.value - a.value);
    expect(DENOMINATIONS.map((d) => d.value)).toEqual(ordered.map((d) => d.value));
  });

  it("gives every denomination its own face colour", () => {
    const faces = new Set(DENOMINATIONS.map((d) => d.face));
    expect(faces.size).toBe(DENOMINATIONS.length);
  });

  it("separates neighbouring denominations by more than colour", () => {
    // A player who cannot tell the red from the green still has to read the
    // table, so no two adjacent chips share a spot count as well as being
    // close in value.
    for (let i = 1; i < DENOMINATIONS.length; i += 1) {
      expect(DENOMINATIONS[i].spots).not.toBe(DENOMINATIONS[i - 1].spots);
    }
  });
});

describe("chipMetrics", () => {
  it("scales every part of the chip with it", () => {
    const small = chipMetrics(9);
    const large = chipMetrics(48);
    expect(large.rim).toBeGreaterThan(small.rim);
    expect(large.edge).toBeGreaterThan(small.edge);
  });

  it("never rounds a rim away to nothing", () => {
    // The chip beside a bet is nine pixels across; a rim of 0.4px is a rim the
    // screen does not draw.
    expect(chipMetrics(4).rim).toBeGreaterThanOrEqual(1);
    expect(chipMetrics(4).edge).toBeGreaterThanOrEqual(1);
  });
});

describe("chipLean", () => {
  it("is the same lean every time for the same chip", () => {
    // A stack re-renders whenever the bet changes. Fresh randomness would make
    // it twitch.
    expect(chipLean(3, 20)).toBe(chipLean(3, 20));
  });

  it("leans both ways", () => {
    const leans = [0, 1, 2, 3, 4, 5].map((i) => chipLean(i, 20));
    expect(leans.some((lean) => lean > 0)).toBe(true);
    expect(leans.some((lean) => lean < 0)).toBe(true);
  });
});
