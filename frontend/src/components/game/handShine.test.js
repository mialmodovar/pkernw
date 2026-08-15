import { describe, it, expect } from "vitest";
import handShines, { isPremiumHoleCards, shiningBoardCards } from "./handShine";

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

describe("shiningBoardCards", () => {
  it("lights up the board cards that are part of the hand", () => {
    // Two pair with the best kicker available: the seven and the deuce play no
    // part in the five and stay dark.
    expect(shiningBoardCards(["AS", "KH"], ["AD", "KC", "7D", "8C", "2H"]).sort())
      .toEqual(["8C", "AD", "KC"]);
  });

  it("includes the kicker, the same five the showdown ring draws", () => {
    // Five cards in total, so every one of them is in the hand.
    expect(shiningBoardCards(["AS", "KH"], ["AD", "KC", "2H"]).sort())
      .toEqual(["2H", "AD", "KC"]);
  });

  it("lights up the whole run of a flush", () => {
    expect(shiningBoardCards(["AS", "KS"], ["QS", "JS", "TS"]).sort())
      .toEqual(["JS", "QS", "TS"]);
  });

  it("gives nothing back when the hand does not shine", () => {
    expect(shiningBoardCards(["AS", "AH"], ["KD", "7C", "2H"])).toEqual([]);
    // Two pair the board made for everybody is not the hero's hand.
    expect(shiningBoardCards(["7S", "2H"], ["KD", "KC", "QH", "QS", "3D"])).toEqual([]);
  });

  it("gives nothing back before the flop, where the shine is the hole cards", () => {
    expect(shiningBoardCards(["AS", "AH"], [])).toEqual([]);
  });

  it("hands back the same strings it was given", () => {
    expect(shiningBoardCards(["A♠", "2♥"], ["3♦", "4♣", "5♥"]).sort())
      .toEqual(["3♦", "4♣", "5♥"]);
  });
});
