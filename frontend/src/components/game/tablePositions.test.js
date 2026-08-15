import { describe, it, expect } from "vitest";
import positionLabels, { positionHint } from "./tablePositions";

// Seats as the table sends them: in seat order, with the button anywhere.
const labelsFor = (seats, dealer) => Object.fromEntries(positionLabels(seats, dealer));

describe("position labels", () => {
  it("names a full ring from the button round to the cutoff", () => {
    expect(labelsFor([0, 1, 2, 3, 4, 5, 6, 7, 8], 0)).toEqual({
      0: "BTN", 1: "SB", 2: "BB", 3: "UTG", 4: "UTG+1", 5: "MP", 6: "LJ", 7: "HJ", 8: "CO",
    });
  });

  it("wraps round the table rather than round the seat numbers", () => {
    expect(labelsFor([0, 1, 2, 3, 4, 5], 4)).toEqual({
      4: "BTN", 5: "SB", 0: "BB", 1: "UTG", 2: "HJ", 3: "CO",
    });
  });

  it("labels the button as the button heads-up, where it is also the small blind", () => {
    expect(labelsFor([2, 5], 5)).toEqual({ 5: "BTN", 2: "BB" });
  });

  it("has a name for every seat three-handed", () => {
    expect(labelsFor([0, 1, 2], 1)).toEqual({ 1: "BTN", 2: "SB", 0: "BB" });
  });

  it("numbers the early seats when the table is bigger than the named positions", () => {
    const labels = labelsFor([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 0);
    expect(labels[3]).toBe("UTG");
    expect(labels[4]).toBe("UTG+1");
    expect(labels[5]).toBe("UTG+2");
    expect(labels[9]).toBe("CO");
  });

  it("says nothing between hands, when there is no button to count from", () => {
    expect(labelsFor([0, 1, 2], null)).toEqual({});
    // A button on a seat that is not in the hand is the same kind of nothing.
    expect(labelsFor([0, 1, 2], 7)).toEqual({});
    expect(labelsFor([], 0)).toEqual({});
  });
});

describe("position hints", () => {
  it("explains the named positions", () => {
    expect(positionHint("BTN")).toMatch(/button/);
    expect(positionHint("CO")).toMatch(/cutoff/);
  });

  it("covers the numbered ones too, and nothing else", () => {
    expect(positionHint("UTG+2")).toBe("early position");
    expect(positionHint(null)).toBeNull();
  });
});
