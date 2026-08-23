import { describe, expect, it } from "vitest";

import { hasHandReads, summaryRow } from "./statsSummary";

const stats = {
  tournaments_played: 12,
  tournaments_completed: 10,
  cashes: 4,
  itm_pct: 40,
  winnings_cents: 23050,
  hands_played: 380,
};

describe("summaryRow", () => {
  it("is the three numbers worth a glance", () => {
    expect(summaryRow(stats).map((one) => one.key)).toEqual(["played", "cashes", "winnings"]);
  });

  it("says how often the cashes came, not just how many", () => {
    expect(summaryRow(stats)[1].value).toBe("4 · 40%");
  });

  it("keeps the rate off until something has actually finished", () => {
    // Nought per cent in the money before your first tournament ends is a
    // judgement, not a statistic.
    const fresh = { ...stats, tournaments_completed: 0, cashes: 0, itm_pct: 0 };
    expect(summaryRow(fresh)[1].value).toBe("0");
  });

  it("calls them games across every format and played within one", () => {
    expect(summaryRow(stats, "all")[0].label).toBe("Games");
    expect(summaryRow(stats, "spingo")[0].label).toBe("Played");
  });

  it("prints the winnings as money", () => {
    expect(summaryRow(stats)[2].value).toBe("€230.50");
  });

  it("has nothing to say before the stats arrive", () => {
    expect(summaryRow(null)).toEqual([]);
  });
});

describe("hasHandReads", () => {
  it("is true once hands have been played", () => {
    expect(hasHandReads(stats)).toBe(true);
  });

  it("is false for a player with no hands, and for no player at all", () => {
    expect(hasHandReads({ hands_played: 0 })).toBe(false);
    expect(hasHandReads(undefined)).toBe(false);
  });
});
