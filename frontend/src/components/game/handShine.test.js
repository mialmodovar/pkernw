import { describe, it, expect } from "vitest";
import handShines, { isPremiumHoleCards } from "./handShine";

describe("premium holdings", () => {
  it("shines for the big pairs and the big broadway hands", () => {
    expect(isPremiumHoleCards(["AS", "AH"])).toBe(true);
    expect(isPremiumHoleCards(["TS", "TH"])).toBe(true);
    expect(isPremiumHoleCards(["AS", "KH"])).toBe(true);  // AK offsuit still plays
    expect(isPremiumHoleCards(["AS", "QS"])).toBe(true);
  });

  it("leaves the rest alone", () => {
    expect(isPremiumHoleCards(["9S", "9H"])).toBe(false);
    expect(isPremiumHoleCards(["AS", "QH"])).toBe(false); // AQ offsuit is not AQs
    expect(isPremiumHoleCards(["KS", "QH"])).toBe(false);
    expect(isPremiumHoleCards(["7S", "2H"])).toBe(false);
    expect(isPremiumHoleCards(["AS"])).toBe(false);
  });

  it("reads the unicode suits the table sends", () => {
    expect(isPremiumHoleCards(["A♠", "A♥"])).toBe(true);
  });
});

describe("handShines", () => {
  it("uses the premium rule until there is a board", () => {
    expect(handShines(["AS", "AH"], [])).toBe(true);
    expect(handShines(["7S", "2H"], [])).toBe(false);
  });

  it("shines for anything better than a pair once the flop is out", () => {
    expect(handShines(["AS", "KH"], ["AD", "KC", "2H"])).toBe(true);   // two pair
    expect(handShines(["9S", "9H"], ["9D", "KC", "2H"])).toBe(true);   // a set
    expect(handShines(["AS", "KS"], ["QS", "JS", "TS"])).toBe(true);   // royal
  });

  it("does not shine for one pair, however pretty the cards were", () => {
    expect(handShines(["AS", "AH"], ["KD", "7C", "2H"])).toBe(false);
    expect(handShines(["AS", "KH"], ["QD", "7C", "2H"])).toBe(false);
  });

  it("ignores a hand the board makes for everybody", () => {
    // Two pair on the board, and the hero plays none of it.
    expect(handShines(["7S", "2H"], ["KD", "KC", "QH", "QS", "3D"])).toBe(false);
    // The same board, but the hero's ace makes a better two pair.
    expect(handShines(["AS", "AD"], ["KD", "KC", "QH", "QS", "3D"])).toBe(true);
  });

  it("counts the wheel as a straight", () => {
    expect(handShines(["AS", "2H"], ["3D", "4C", "5H"])).toBe(true);
  });

  it("says nothing without two hole cards", () => {
    expect(handShines([], ["AD", "KC", "2H"])).toBe(false);
    expect(handShines(null, null)).toBe(false);
  });
});
