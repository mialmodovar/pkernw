import { describe, expect, it } from "vitest";

import {
  DEFAULT_POSTFLOP_PCT, DEFAULT_PREFLOP_BB, betPresets, cleanSizes, potIsOpen, raiseToShare,
} from "./betPresets";

const clamp = (min, max) => (chips) => Math.min(Math.max(chips, min), max);

describe("potIsOpen", () => {
  it("does not count the big blind as somebody's bet", () => {
    // It is a bet nobody chose, so a pot nobody has raised is unopened.
    expect(potIsOpen({ street: "preflop", streetBet: 100, bb: 100 })).toBe(false);
  });

  it("counts a raise", () => {
    expect(potIsOpen({ street: "preflop", streetBet: 400, bb: 100 })).toBe(true);
  });

  it("counts any bet at all after the flop", () => {
    expect(potIsOpen({ street: "flop", streetBet: 50, bb: 100 })).toBe(true);
    expect(potIsOpen({ street: "flop", streetBet: 0, bb: 100 })).toBe(false);
  });
});

describe("betPresets", () => {
  it("prices an unopened pot in blinds", () => {
    const presets = betPresets({
      street: "preflop", streetBet: 100, bb: 100, pot: 150, maxRaise: 10000,
      clamp: clamp(200, 10000),
    });

    expect(presets.map((one) => one.label)).toEqual(["2bb", "2.5bb", "3.5bb", "All in"]);
    expect(presets[0].chips).toBe(200);
    expect(presets[2].chips).toBe(350);
  });

  it("prices a pot somebody has opened as a share of it", () => {
    // The bug: three blind-sized buttons all clamped to the minimum raise, so
    // 2bb, 2.5bb and 3.5bb were three buttons doing one thing — and none of
    // them the thing they said. Facing a 4bb open from the big blind: 700 in
    // the middle, 300 to call, minimum raise 700.
    const presets = betPresets({
      street: "preflop", streetBet: 400, toCall: 300, bb: 100, pot: 700,
      maxRaise: 10000, clamp: clamp(700, 10000),
    });

    expect(presets.map((one) => one.label)).toEqual(["25%", "40%", "75%", "All in"]);
    // Three different amounts, all of them legal, which is the whole point.
    const amounts = presets.slice(0, 3).map((one) => one.chips);
    expect(new Set(amounts).size).toBe(3);
    expect(Math.min(...amounts)).toBeGreaterThanOrEqual(700);
  });

  it("counts the call before taking its share, which is what a pot raise is", () => {
    // 700 in the middle and 300 to call: a pot-sized raise is call, then raise
    // the 1,000 that is then out there — to 1,700 in total, not to 700.
    expect(raiseToShare({ pct: 100, pot: 700, streetBet: 400, toCall: 300 })).toBe(1700);
  });

  it("is a plain share of the pot when there is nothing to call", () => {
    expect(raiseToShare({ pct: 75, pot: 1000, streetBet: 0, toCall: 0 })).toBe(750);
  });

  it("prices every street after the flop as a share", () => {
    const presets = betPresets({
      street: "turn", streetBet: 0, bb: 100, pot: 1000, maxRaise: 10000,
    });

    expect(presets.map((one) => one.label)).toEqual(["25%", "40%", "75%", "All in"]);
    expect(presets[1].chips).toBe(400);
  });

  it("uses the player's own sizes", () => {
    const presets = betPresets({
      street: "preflop", streetBet: 100, bb: 100, maxRaise: 9999,
      preflopBB: [3, 5],
    });

    expect(presets.map((one) => one.label)).toEqual(["3bb", "5bb", "All in"]);
  });

  it("always ends in all in", () => {
    const presets = betPresets({ street: "flop", pot: 100, bb: 10, maxRaise: 4242 });

    expect(presets.at(-1)).toEqual({ label: "All in", chips: 4242, emphasis: true });
  });

  it("never offers an amount the table would refuse", () => {
    const presets = betPresets({
      street: "flop", pot: 100000, bb: 100, maxRaise: 1500,
      clamp: clamp(200, 1500),
    });

    expect(presets.every((one) => one.chips <= 1500)).toBe(true);
  });
});

describe("cleanSizes", () => {
  it("keeps a list of numbers in the order it was given", () => {
    expect(cleanSizes([3, 4.5, 10], DEFAULT_PREFLOP_BB)).toEqual([3, 4.5, 10]);
  });

  it("falls back to the app's own when there is nothing usable", () => {
    expect(cleanSizes([], DEFAULT_PREFLOP_BB)).toEqual(DEFAULT_PREFLOP_BB);
    expect(cleanSizes(["nonsense", 0, -3], DEFAULT_POSTFLOP_PCT)).toEqual(DEFAULT_POSTFLOP_PCT);
    expect(cleanSizes(null, DEFAULT_PREFLOP_BB)).toEqual(DEFAULT_PREFLOP_BB);
  });

  it("keeps three, because the row has four slots and one is all in", () => {
    expect(cleanSizes([1, 2, 3, 4, 5], DEFAULT_PREFLOP_BB)).toEqual([1, 2, 3]);
  });

  it("rounds to something a button can print", () => {
    expect(cleanSizes([2.66666], DEFAULT_PREFLOP_BB)).toEqual([2.7]);
  });
});
