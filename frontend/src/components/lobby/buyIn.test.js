import { describe, expect, it } from "vitest";

import {
  buyInLabel, coinCount, formatCoins, isRealMoney, isSpinGo, prizeLabel, realMoneyEntry,
} from "./buyIn";

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

describe("isRealMoney", () => {
  it("is the euro buy-in and nothing else", () => {
    expect(isRealMoney({ buy_in_cents: 2000 })).toBe(true);
    // Coins are the app's own currency and cost nobody anything real, however
    // many of them a game takes.
    expect(isRealMoney({ buy_in_coins: 500 })).toBe(false);
    expect(isRealMoney({ buy_in_cents: 0, buy_in_coins: 0 })).toBe(false);
  });

  it("survives a tournament that has not loaded", () => {
    expect(isRealMoney(undefined)).toBe(false);
    expect(isRealMoney(null)).toBe(false);
  });
});

describe("realMoneyEntry", () => {
  it("asks for the buy-in, not the buy-in plus its own bounty", () => {
    // The bounty is a slice of the 20, so agreeing to this costs 20 — a dialog
    // that added them would be asking for twice what is owed.
    expect(realMoneyEntry({ buy_in_cents: 2000, bounty_mode: "fixed", bounty_cents: 500 }))
      .toEqual({ cost: "20.00€", bounty: "5.00€" });
  });

  it("leaves the bounty out where the night has none", () => {
    expect(realMoneyEntry({ buy_in_cents: 2000 })).toEqual({ cost: "20.00€", bounty: null });
    expect(realMoneyEntry({ buy_in_cents: 2000, bounty_mode: "none", bounty_cents: 500 }))
      .toEqual({ cost: "20.00€", bounty: null });
  });

  it("does not repeat a misconfigured bounty back as a fact", () => {
    // A bounty bigger than the entry is a broken tournament. The dialog says
    // the whole buy-in went on heads rather than a figure that cannot be true.
    expect(realMoneyEntry({ buy_in_cents: 1000, bounty_mode: "mystery", bounty_cents: 9999 }))
      .toEqual({ cost: "10.00€", bounty: "10.00€" });
  });
});
