import { describe, expect, it } from "vitest";

import {
  entryCount, payoutLabel, placeCents, placingPoolCents, seatedEntries, totalPool,
} from "./prizePool";

// A 20€ progressive with a 10€ bounty: three players, one of whom rebought.
// Four entries, so 40€ is played for by placing and 40€ rides on heads.
const pko = {
  buy_in_cents: 2000,
  bounty_mode: "progressive",
  bounty_cents: 1000,
  bounty_progressive_split_pct: 50,
  players: [
    { username: "a", rebuy_count: 0 },
    { username: "b", rebuy_count: 1 },
    { username: "c", rebuy_count: 0 },
  ],
};

const plain = { ...pko, bounty_mode: "none", bounty_cents: 0 };

describe("entryCount", () => {
  it("counts a rebuy as another buy-in", () => {
    expect(entryCount(pko)).toBe(4);
  });

  it("is nothing when nobody has sat down", () => {
    expect(entryCount({})).toBe(0);
  });
});

describe("placingPoolCents", () => {
  it("leaves the bounty half out — it is paid hand by hand, not by placing", () => {
    expect(placingPoolCents(pko)).toBe(4000);
  });

  it("is the whole buy-in when there are no bounties", () => {
    expect(placingPoolCents(plain)).toBe(8000);
  });

  it("does not subtract a bounty that is switched off", () => {
    expect(placingPoolCents({ ...pko, bounty_mode: "none" })).toBe(8000);
  });

  it("never goes negative on a bounty at or above the buy-in", () => {
    expect(placingPoolCents({ ...pko, bounty_cents: 5000 })).toBe(0);
  });
});

describe("placeCents", () => {
  it("divides the placing pool, not the money on heads", () => {
    expect(placeCents(pko, 70, entryCount(pko))).toBe(2800);
    expect(placeCents(plain, 70, entryCount(plain))).toBe(5600);
  });

  it("has nothing to divide in a game played for nothing", () => {
    expect(placeCents({ players: [{ rebuy_count: 0 }] }, 70, 1)).toBeNull();
  });
});

describe("payoutLabel", () => {
  it("says the money where there is money", () => {
    expect(payoutLabel(pko, { percentage: 70 }, entryCount(pko))).toBe("€28");
  });

  it("falls back to the share where there is no pot", () => {
    expect(payoutLabel({ players: [] }, { percentage: 70 }, 0)).toBe("70%");
  });
});

describe("totalPool", () => {
  it("is everything paid in, bounties included", () => {
    // The same PKO the file opens with: four entries at 20€, half of it on
    // heads. placingPoolCents says 40€ because that is what the places divide;
    // the night was worth 80€.
    expect(placingPoolCents(pko)).toBe(4000);
    expect(totalPool(pko)).toEqual({ kind: "euros", amount: 8000 });
  });

  it("counts a plain tournament as the buy-ins", () => {
    const plain = { buy_in_cents: 1000, players: [{}, {}, {}] };
    expect(totalPool(plain)).toEqual({ kind: "euros", amount: 3000 });
  });

  it("prefers coins where a tournament is played for them", () => {
    const coins = { buy_in_coins: 50, players: [{}, {}] };
    expect(totalPool(coins)).toEqual({ kind: "coins", amount: 100 });
  });

  it("reads a Spin n Go's pool off the draw rather than the entries", () => {
    const spin = { format: "spingo", buy_in_coins: 25, spin_multiplier: 10, players: [{}, {}, {}] };
    expect(totalPool(spin)).toEqual({ kind: "coins", amount: 250 });
  });

  it("is nothing at all for a free game, rather than zero", () => {
    expect(totalPool({ players: [{}, {}] })).toBe(null);
    expect(totalPool({ buy_in_cents: 2000, players: [] })).toBe(null);
  });

  it("takes the entry count a caller hands it, for a list row with no seats", () => {
    expect(totalPool({ buy_in_cents: 2000 }, 6)).toEqual({ kind: "euros", amount: 12000 });
  });
});

describe("seatedEntries", () => {
  it("is the seat count a list row carries", () => {
    expect(seatedEntries({ player_count: 7 })).toBe(7);
  });

  it("is nothing for a row that has not loaded", () => {
    expect(seatedEntries(undefined)).toBe(0);
    expect(seatedEntries({ player_count: -3 })).toBe(0);
  });
});
