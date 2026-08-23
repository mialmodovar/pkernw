import { describe, expect, it } from "vitest";

import { SLOTS, raiseLabel, slotsAgree, turnSlots, waitingSlots } from "./actionSlots";

const FACING_A_BET = { fold: true, check: false, call: true, raise: true };
const NOBODY_BET = { fold: false, check: true, call: false, raise: true };
const FACING_AN_ALL_IN = { fold: true, check: false, call: true, raise: false };

describe("the three slots", () => {
  it("are always in the same order", () => {
    for (const can of [FACING_A_BET, NOBODY_BET, FACING_AN_ALL_IN, {}]) {
      expect(turnSlots(can).map((cell) => cell.slot)).toEqual(SLOTS);
    }
    expect(waitingSlots({ inHand: true }).map((cell) => cell.slot)).toEqual(SLOTS);
  });

  it("are always three, so the row is the same shape every hand", () => {
    for (const can of [FACING_A_BET, NOBODY_BET, FACING_AN_ALL_IN, {}]) {
      expect(turnSlots(can)).toHaveLength(3);
    }
  });
});

describe("turnSlots", () => {
  it("puts check and call in one slot, because they are one decision", () => {
    expect(turnSlots(FACING_A_BET)[1].kind).toBe("call");
    expect(turnSlots(NOBODY_BET)[1].kind).toBe("check");
  });

  it("empties the fold slot when checking is free rather than offering it", () => {
    expect(turnSlots(NOBODY_BET)[0].kind).toBe("empty");
  });

  it("keeps the raise slot open and empty when there is nothing to raise", () => {
    expect(turnSlots(FACING_AN_ALL_IN)[2].kind).toBe("empty");
  });
});

describe("waitingSlots", () => {
  it("puts each pre-selection where its own button will appear", () => {
    const [fold, passive, aggressive] = waitingSlots({ inHand: true });
    expect(fold).toMatchObject({ kind: "preselect", preselect: "fold" });
    expect(passive).toMatchObject({ kind: "preselect", preselect: "check" });
    // Nothing pre-commits a raise, and a cursor resting here must not find one.
    expect(aggressive.kind).toBe("empty");
  });

  it("offers nothing to somebody who is not in the hand", () => {
    expect(waitingSlots({ inHand: false }).every((cell) => cell.kind === "empty")).toBe(true);
  });
});

describe("the property the whole layout exists for", () => {
  it("means a still cursor finds the same decision when the turn arrives", () => {
    for (const can of [FACING_A_BET, NOBODY_BET, FACING_AN_ALL_IN]) {
      expect(slotsAgree(waitingSlots({ inHand: true }), turnSlots(can)), JSON.stringify(can))
        .toBe(true);
    }
  });

  it("catches a layout that would move a decision under the cursor", () => {
    const shuffled = [
      { slot: "fold", kind: "raise" },
      { slot: "passive", kind: "call" },
      { slot: "aggressive", kind: "empty" },
    ];
    expect(slotsAgree(waitingSlots({ inHand: true }), shuffled)).toBe(false);
  });

  it("catches the slots being reordered", () => {
    const reordered = turnSlots(FACING_A_BET).slice().reverse();
    expect(slotsAgree(waitingSlots({ inHand: true }), reordered)).toBe(false);
  });
});

describe("raiseLabel", () => {
  const chips = (n) => n.toLocaleString();

  it("says all in when the only raise is the whole stack", () => {
    // Every decision in an All In or Fold game, and anybody too short to raise
    // by less anywhere else.
    expect(raiseLabel(1500, 1500, 1500, chips)).toBe("All in");
  });

  it("says the amount when there is an amount to choose", () => {
    expect(raiseLabel(400, 12000, 900, chips)).toBe("Raise 900");
  });

  it("treats a min above the max as a shove rather than as nonsense", () => {
    expect(raiseLabel(2000, 1500, 1500, chips)).toBe("All in");
  });
});
