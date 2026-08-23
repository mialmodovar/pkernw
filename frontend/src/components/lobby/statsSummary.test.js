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

describe("a cash record, which is a different shape", () => {
  const cash = {
    kind: "cash", hands_played: 412, net_coins: -240, biggest_pot: 980,
  };

  it("counts hands rather than games, because a cash game is not a thing you play one of", () => {
    const [hands] = summaryRow(cash);
    expect(hands.label).toBe("Hands");
    expect(hands.value).toBe("412");
  });

  it("says you are down when you are down", () => {
    const [, net] = summaryRow(cash);
    expect(net.value).toBe("-240");
    expect(net.title).toMatch(/down/);
  });

  it("says you are up with the sign written out", () => {
    const [, net] = summaryRow({ ...cash, net_coins: 3200 });
    expect(net.value).toBe("+3200");
    expect(net.title).toMatch(/up/);
  });

  it("has nothing to say about cashes or the money, which do not exist here", () => {
    expect(summaryRow(cash).map((one) => one.key)).toEqual(["hands", "net", "pot"]);
  });

  it("reads as zeroes for somebody who has never sat at one", () => {
    expect(summaryRow({ kind: "cash" }).map((one) => one.value)).toEqual(["0", "0", "0"]);
  });

  it("leaves a tournament record alone", () => {
    expect(summaryRow({ kind: "tournament", tournaments_played: 4 })[0].label).toBe("Games");
  });
});
