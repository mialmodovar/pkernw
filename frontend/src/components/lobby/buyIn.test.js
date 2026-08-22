import { describe, expect, it } from "vitest";

import { buyInLabel, coinCount, formatCoins, isSpinGo, prizeLabel } from "./buyIn";

describe("buyInLabel", () => {
  it("prints a euro buy-in as euros", () => {
    expect(buyInLabel({ buy_in_cents: 2000 })).toBe("20.00€");
  });

  it("prints a coin buy-in as coins, so the two can never be read for each other", () => {
    expect(buyInLabel({ buy_in_coins: 50 })).toBe(`${formatCoins(50)}`);
    expect(buyInLabel({ buy_in_coins: 50 })).toContain("50");
  });

  it("still says free for the tournaments that predate coins", () => {
    expect(buyInLabel({ buy_in_cents: 0, buy_in_coins: 0 })).toBe("free");
  });
});

describe("prizeLabel", () => {
  it("counts a coin pool from the entries", () => {
    expect(prizeLabel({ buy_in_coins: 50 }, 4)).toBe(`${formatCoins(200)} pool`);
  });

  it("says nothing about a coin pool nobody has entered yet", () => {
    expect(prizeLabel({ buy_in_coins: 50 }, 0)).toBeNull();
  });

  it("reads a Spin n Go's prize off the draw rather than the entries", () => {
    const spin = { format: "spingo", buy_in_coins: 25, spin_multiplier: 10 };
    expect(prizeLabel(spin, 3)).toBe(`${formatCoins(250)} prize`);
  });

  it("says when a Spin n Go has not been drawn yet", () => {
    const waiting = { format: "spingo", buy_in_coins: 25, spin_multiplier: 0 };
    expect(prizeLabel(waiting, 2)).toBe("prize drawn at three players");
  });

  it("leaves the euro pool to the caller, which knows about bounties", () => {
    expect(prizeLabel({ buy_in_cents: 2000 }, 3)).toBeNull();
  });

  it("says outright when nothing is at stake", () => {
    expect(prizeLabel({}, 3)).toBe("no prize");
  });
});

describe("isSpinGo", () => {
  it("knows one from a tournament", () => {
    expect(isSpinGo({ format: "spingo" })).toBe(true);
    expect(isSpinGo({ format: "standard" })).toBe(false);
    expect(isSpinGo(undefined)).toBe(false);
  });
});

describe("the coin figure", () => {
  it("is the count alone where the chip is drawn beside it", () => {
    expect(coinCount(1500)).toBe("1,500");
  });

  it("says the word in prose, because an icon mid-sentence is a rebus", () => {
    expect(formatCoins(50)).toBe("50 coins");
  });

  it("hands back no emoji at all — the app draws its own chip", () => {
    for (const text of [formatCoins(50), buyInLabel({ buy_in_coins: 50 }), prizeLabel({ buy_in_coins: 50 }, 4)]) {
      expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    }
  });
});
