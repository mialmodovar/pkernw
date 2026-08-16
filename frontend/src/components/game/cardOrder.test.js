import { describe, expect, it } from "vitest";

import { highToLow, needsSorting, rankValue } from "./cardOrder";

describe("rankValue", () => {
  it("puts an ace over a king over a nine", () => {
    expect(rankValue("A♠")).toBeGreaterThan(rankValue("K♥"));
    expect(rankValue("K♥")).toBeGreaterThan(rankValue("9♦"));
    expect(rankValue("T♣")).toBeGreaterThan(rankValue("9♦"));
  });

  it("reads the server's spelling and the picker's alike", () => {
    expect(rankValue("As")).toBe(rankValue("A♠"));
  });

  it("does not throw on something that is not a card", () => {
    expect(rankValue("??")).toBe(-1);
    expect(rankValue(null)).toBe(-1);
  });
});

describe("highToLow", () => {
  it("hands back positions, not cards", () => {
    // 9 then A is dealt 0,1 and drawn 1,0 — the ace first.
    expect(highToLow(["9♦", "A♠"])).toEqual([1, 0]);
  });

  it("leaves a hand that is already the right way round alone", () => {
    expect(highToLow(["A♠", "9♦"])).toEqual([0, 1]);
  });

  it("keeps a pair in the order it was dealt", () => {
    // Nothing to choose between them, and a pair that swapped itself on every
    // render would be a fidget.
    expect(highToLow(["9♥", "9♦"])).toEqual([0, 1]);
  });

  it("copes with an empty hand", () => {
    expect(highToLow([])).toEqual([]);
    expect(highToLow(null)).toEqual([]);
  });
});

describe("needsSorting", () => {
  it("is true only when something would actually move", () => {
    expect(needsSorting(["9♦", "A♠"])).toBe(true);
    expect(needsSorting(["A♠", "9♦"])).toBe(false);
    expect(needsSorting(["9♥", "9♦"])).toBe(false);
  });
});
