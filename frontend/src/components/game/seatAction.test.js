import { describe, expect, it } from "vitest";

import {
  actionHoldMs, actionLabel, actionTone, isWorthShowing,
} from "./seatAction";

const chips = (n) => n.toLocaleString();

describe("what earns a pill", () => {
  it("is anything a player decided to do", () => {
    for (const action of ["fold", "check", "call", "bet", "raise"]) {
      expect(isWorthShowing(action), action).toBe(true);
    }
  });

  it("is not the blinds or the antes, which are the price of the seat", () => {
    expect(isWorthShowing("blind")).toBe(false);
    expect(isWorthShowing("ante")).toBe(false);
    expect(isWorthShowing(null)).toBe(false);
  });
});

describe("actionLabel", () => {
  it("says what was done, with the number where there is one", () => {
    expect(actionLabel({ action: "fold" }, chips)).toBe("Fold");
    expect(actionLabel({ action: "check" }, chips)).toBe("Check");
    expect(actionLabel({ action: "call", amount: 300 }, chips)).toBe("Call 300");
    expect(actionLabel({ action: "bet", amount: 500 }, chips)).toBe("Bet 500");
    expect(actionLabel({ action: "raise", amount: 1200 }, chips)).toBe("Raise to 1,200");
  });

  it("calls a raise of the last chip an all in, which is what the table needs", () => {
    expect(actionLabel({ action: "raise", amount: 4400, allIn: true }, chips)).toBe("All in");
    expect(actionLabel({ action: "call", amount: 900, allIn: true }, chips)).toBe("All in");
  });

  it("reads in whatever the player set the table to", () => {
    const bb = (n) => `${(n / 100).toFixed(1)}bb`;
    expect(actionLabel({ action: "raise", amount: 250 }, bb)).toBe("Raise to 2.5bb");
  });

  it("says call without a figure when the call was free of charge", () => {
    expect(actionLabel({ action: "call", amount: 0 }, chips)).toBe("Call");
  });

  it("has nothing to say about an action it does not know", () => {
    expect(actionLabel({ action: "muck" }, chips)).toBe(null);
    expect(actionLabel(undefined, chips)).toBe(null);
  });
});

describe("actionTone", () => {
  it("is loudest for the all in and quietest for the fold", () => {
    expect(actionTone({ allIn: true })).toBe("allin");
    expect(actionTone({ action: "fold" })).toBe("spent");
    expect(actionTone({ action: "check" })).toBe("quiet");
    expect(actionTone({ action: "raise" })).toBe("chips");
    expect(actionTone({ action: "call" })).toBe("chips");
  });
});

describe("how long a pill lives", () => {
  it("leaves every action up until the betting moves on", () => {
    // The whole street, folds included: what happened in front of you is what
    // you are reading the felt for when it comes round to you.
    for (const action of ["fold", "check", "call", "bet", "raise"]) {
      expect(actionHoldMs({ action }), action).toBe(null);
    }
  });

  it("keeps an all in up even though the player is done acting", () => {
    // They folded nothing: their chips are in the middle and stay there.
    expect(actionHoldMs({ action: "call", allIn: true })).toBe(null);
  });
});
