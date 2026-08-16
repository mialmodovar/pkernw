import { describe, it, expect } from "vitest";

import { faceUpFromRunout, holdFaceDown, resultIsRevealed } from "./useShowdownReveal";

const showdown = [{ seat: 1 }, { seat: 2 }];

describe("holdFaceDown", () => {
  it("holds a hand that has not turned over yet", () => {
    expect(holdFaceDown({
      seat: 2, revealedSeats: new Set([1]), faceUpSeats: new Set(), isMe: false,
    })).toBe(true);
  });

  it("shows one that has", () => {
    expect(holdFaceDown({
      seat: 1, revealedSeats: new Set([1]), faceUpSeats: new Set(), isMe: false,
    })).toBe(false);
  });

  it("never hides a hand a runout already turned face up", () => {
    // The bug: two players all in on the river had been looking at each
    // other's cards for three streets, and the stagger flipped the second hand
    // back down for an interval before showing it again.
    expect(holdFaceDown({
      seat: 2, revealedSeats: new Set([1]), faceUpSeats: faceUpFromRunout([{ seat: 1 }, { seat: 2 }]), isMe: false,
    })).toBe(false);
  });

  it("never hides your own cards from you", () => {
    expect(holdFaceDown({
      seat: 2, revealedSeats: new Set([1]), faceUpSeats: new Set(), isMe: true,
    })).toBe(false);
  });

  it("holds nothing when there is no showdown at all", () => {
    expect(holdFaceDown({
      seat: 2, revealedSeats: null, faceUpSeats: new Set(), isMe: false,
    })).toBe(false);
  });
});

describe("faceUpFromRunout", () => {
  it("is the seats the equity reading named", () => {
    expect(faceUpFromRunout([{ seat: 3 }, { seat: 5 }])).toEqual(new Set([3, 5]));
  });

  it("is empty when the hand was never all in", () => {
    expect(faceUpFromRunout(null).size).toBe(0);
    expect(faceUpFromRunout([]).size).toBe(0);
  });
});

describe("resultIsRevealed", () => {
  it("waits for every hand to turn over", () => {
    expect(resultIsRevealed({
      showdown, revealedSeats: new Set([1]), faceUpSeats: new Set(),
    })).toBe(false);
  });

  it("lets go once they have", () => {
    expect(resultIsRevealed({
      showdown, revealedSeats: new Set([1, 2]), faceUpSeats: new Set(),
    })).toBe(true);
  });

  it("does not make a runout wait — there is nothing left to give away", () => {
    expect(resultIsRevealed({
      showdown, revealedSeats: new Set([1]), faceUpSeats: new Set([1, 2]),
    })).toBe(true);
  });

  it("is true when no showdown is running", () => {
    expect(resultIsRevealed({ showdown: null, revealedSeats: null, faceUpSeats: new Set() })).toBe(true);
  });
});
