import { describe, expect, it } from "vitest";

import {
  barPct, claimableCount, forPeriod, periodSummary, progressLabel, unclaimedCoins,
} from "./missions";

const board = [
  { key: "daily_play", period: "daily", target: 3, progress: 3, coins: 60, done: true, claimed: true, claimable: false },
  { key: "daily_win", period: "daily", target: 1, progress: 1, coins: 120, done: true, claimed: false, claimable: true },
  { key: "daily_both", period: "daily", target: 2, progress: 1, coins: 80, done: false, claimed: false, claimable: false },
  { key: "weekly_play", period: "weekly", target: 20, progress: 4, coins: 400, done: false, claimed: false, claimable: false },
];

describe("forPeriod", () => {
  it("keeps the two apart, in the order they arrived", () => {
    expect(forPeriod(board, "daily").map((one) => one.key))
      .toEqual(["daily_play", "daily_win", "daily_both"]);
    expect(forPeriod(board, "weekly")).toHaveLength(1);
  });

  it("survives a board that has not loaded", () => {
    expect(forPeriod(undefined, "daily")).toEqual([]);
  });
});

describe("barPct", () => {
  it("is how far along, as a percentage", () => {
    expect(barPct({ progress: 1, target: 2 })).toBe(50);
    expect(barPct({ progress: 4, target: 20 })).toBe(20);
  });

  it("is full at the target and never past it", () => {
    expect(barPct({ progress: 3, target: 3 })).toBe(100);
    expect(barPct({ progress: 9, target: 3 })).toBe(100);
  });

  it("does not divide by a target of nothing", () => {
    expect(barPct({ progress: 0, target: 0 })).toBe(0);
    expect(barPct(undefined)).toBe(0);
  });
});

describe("progressLabel", () => {
  it("counts the ones worth counting", () => {
    expect(progressLabel({ target: 3, progress: 2 })).toBe("2 / 3");
  });

  it("says done rather than 1 / 1, which nobody reads as a score", () => {
    expect(progressLabel({ target: 1, progress: 1 })).toBe("done");
    expect(progressLabel({ target: 1, progress: 0 })).toBe("not yet");
  });

  it("says so once the coins have been taken", () => {
    expect(progressLabel({ target: 3, progress: 3, claimed: true })).toBe("claimed");
  });
});

describe("what is waiting", () => {
  it("adds up only the coins that can actually be collected", () => {
    expect(unclaimedCoins(board)).toBe(120);
    expect(claimableCount(board)).toBe(1);
  });

  it("is nothing on an empty board", () => {
    expect(unclaimedCoins([])).toBe(0);
    expect(claimableCount(undefined)).toBe(0);
  });
});

describe("periodSummary", () => {
  it("leads with coins waiting, because that is the part needing an action", () => {
    expect(periodSummary(board, "daily")).toBe("120 coins waiting");
  });

  it("says how many have been taken when none are waiting", () => {
    expect(periodSummary(board, "weekly")).toBe("0 of 1 taken");
  });

  it("says all taken rather than 3 of 3, which reads as unfinished", () => {
    const done = board
      .filter((one) => one.period === "daily")
      .map((one) => ({ ...one, claimed: true, claimable: false }));
    expect(periodSummary(done, "daily")).toBe("all taken");
  });

  it("has nothing to say about a period with no missions in it", () => {
    expect(periodSummary([], "daily")).toBe("");
  });
});
