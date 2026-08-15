import { describe, it, expect } from "vitest";

import { equityShake } from "./equitySwing";

const reading = (...pairs) => pairs.map(([seat, equity]) => ({ seat, equity }));

describe("equityShake", () => {
  it("says nothing when the card barely mattered", () => {
    expect(equityShake(reading([1, 62], [2, 38]), reading([1, 68], [2, 32]))).toBeNull();
  });

  it("shakes when a card moves the hand a long way", () => {
    expect(equityShake(reading([1, 70], [2, 30]), reading([1, 40], [2, 60]))).toBe("hard");
  });

  it("shakes for a lead change that the arithmetic alone would miss", () => {
    // Fifteen points is not a big number, but it took the hand off seat 1.
    expect(equityShake(reading([1, 55], [2, 45]), reading([1, 40], [2, 60]))).toBe("soft");
  });

  it("does not shake for a small move that keeps the same player ahead", () => {
    expect(equityShake(reading([1, 80], [2, 20]), reading([1, 92], [2, 8]))).toBeNull();
  });

  it("calls a card that settles it outright brutal", () => {
    expect(equityShake(reading([1, 45], [2, 55]), reading([1, 100], [2, 0]))).toBe("hard");
  });

  it("has nothing to compare on the first reading of a hand", () => {
    expect(equityShake(null, reading([1, 50], [2, 50]))).toBeNull();
    expect(equityShake([], reading([1, 50], [2, 50]))).toBeNull();
  });

  it("ignores a seat that is not in both readings", () => {
    // Somebody leaving the list is not a ninety-point swing.
    expect(equityShake(reading([1, 50], [2, 50]), reading([1, 100]))).toBe("hard");
    expect(equityShake(reading([1, 50]), reading([1, 52], [3, 48]))).toBeNull();
  });

  it("survives being handed nonsense", () => {
    expect(equityShake(undefined, undefined)).toBeNull();
    expect(equityShake(reading([1, 50]), null)).toBeNull();
  });
});
