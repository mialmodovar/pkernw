import { describe, expect, it } from "vitest";

import { BIG_SHARE, chipsCommitted, needsConfirm } from "./confirmAction";

describe("chipsCommitted", () => {
  it("counts a raise as what it costs, not as what the button says", () => {
    // Raise to 1,200 with 400 of yours already out is 800 more of your chips.
    expect(chipsCommitted({ action: "raise", amount: 1200, myBet: 400 })).toBe(800);
  });

  it("counts a call as what is left to put in", () => {
    expect(chipsCommitted({ action: "call", toCall: 750 })).toBe(750);
  });

  it("counts a fold and a check as nothing, because they are", () => {
    expect(chipsCommitted({ action: "fold", toCall: 750 })).toBe(0);
    expect(chipsCommitted({ action: "check" })).toBe(0);
  });
});

describe("needsConfirm", () => {
  const stack = 10_000;

  it("asks again before a shove", () => {
    expect(needsConfirm({ action: "raise", amount: 10_000, stack })).toBe(true);
  });

  it("asks again before a call for most of what you have", () => {
    expect(needsConfirm({ action: "call", toCall: 6_000, stack })).toBe(true);
  });

  it("stays out of the way of an ordinary bet", () => {
    expect(needsConfirm({ action: "raise", amount: 900, stack })).toBe(false);
    expect(needsConfirm({ action: "call", toCall: 400, stack })).toBe(false);
  });

  it("never asks about a fold or a check, whatever is in front of you", () => {
    expect(needsConfirm({ action: "fold", toCall: 9_000, stack })).toBe(false);
    expect(needsConfirm({ action: "check", stack })).toBe(false);
  });

  it("measures the raise against the chips behind rather than against the total", () => {
    // Raise to 5,500 with 5,000 already in front of you is 500 of your 10,000:
    // a small decision that reads as a big number.
    expect(needsConfirm({ action: "raise", amount: 5_500, myBet: 5_000, stack })).toBe(false);
  });

  it("sits exactly on the threshold rather than a chip either side of it", () => {
    const half = stack * BIG_SHARE;
    expect(needsConfirm({ action: "call", toCall: half, stack })).toBe(true);
    expect(needsConfirm({ action: "call", toCall: half - 1, stack })).toBe(false);
  });

  it("treats anything at all as everything when there is nothing behind", () => {
    // A short stack's last chips: the number is small and the decision is not.
    expect(needsConfirm({ action: "call", toCall: 25, stack: 0 })).toBe(true);
  });
});
