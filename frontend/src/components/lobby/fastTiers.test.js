import { describe, expect, it } from "vitest";

import {
  formatMeta, hasSharedPrizes, isMyTier, myGameAction, myQueueAt, myTablesAt, myTierGames,
  payoutRows, prizeRows, prizeSummary, seatCounts, seatPips, tierAction,
} from "./fastTiers";

const tier = { key: "spingo", stake: 25, seats_needed: 3, game: null, odds: [] };
const huTier = { key: "hu", stake: 10, seats_needed: 2, game: null, payouts: [] };

describe("formatMeta", () => {
  it("says the shape of the game in players, blinds and minutes", () => {
    expect(formatMeta({ seats: 3, big_blinds: 15, duration: "3-5 min" }))
      .toBe("3 players · 15bb · 3-5 min");
    expect(formatMeta({ seats: 2, big_blinds: 25, duration: "5-10 min" }))
      .toBe("2 players · 25bb · 5-10 min");
  });

  it("survives a format that has not loaded", () => {
    expect(formatMeta(null)).toBe("");
  });
});

describe("prizeSummary", () => {
  it("gives a drawn game its range, which is the whole point of it", () => {
    const drawn = {
      odds: [
        { multiplier: 2, prize_coins: 50, winner_coins: 50 },
        { multiplier: 10, prize_coins: 250, winner_coins: 250 },
        // The big one is shared three ways, so the winner takes 2,000 of the
        // 2,500 — and the headline is what one player takes home.
        { multiplier: 100, prize_coins: 2500, winner_coins: 2000, shared: true },
      ],
    };
    expect(prizeSummary(drawn, { draws_multiplier: true })).toEqual({
      label: "Prize", value: "50 – 2,000",
    });
  });

  it("names the winner's share where one place is paid", () => {
    const hu = { payouts: [{ place: 1, label: "1st", percentage: 100, coins: 20 }] };
    expect(prizeSummary(hu, { draws_multiplier: false })).toEqual({
      label: "Winner takes", value: "20",
    });
  });

  it("lists both shares where two places are paid", () => {
    const sixmax = {
      payouts: [
        { place: 1, coins: 97 },
        { place: 2, coins: 52 },
      ],
    };
    expect(prizeSummary(sixmax, { draws_multiplier: false })).toEqual({
      label: "Top 2 paid", value: "97 · 52",
    });
  });

  it("says something rather than nothing when the prizes have not arrived", () => {
    expect(prizeSummary({}, { draws_multiplier: true }).value).toBe("drawn at the table");
    expect(prizeSummary({}, { draws_multiplier: false }).value).toBe("—");
  });
});

describe("seatPips", () => {
  it("is one pip per seat, filled from the left", () => {
    expect(seatPips({ seats_needed: 3, game: { seats: 1 } })).toEqual([true, false, false]);
  });

  it("is all empty at a table nobody has sat at", () => {
    expect(seatPips({ seats_needed: 2 })).toEqual([false, false]);
  });

  it("fills up as a table does", () => {
    expect(seatPips({ seats_needed: 6, game: { seats: 6 } })).toEqual(
      [true, true, true, true, true, true],
    );
  });
});

describe("seatCounts", () => {
  it("is empty until somebody sits", () => {
    expect(seatCounts(tier)).toEqual([0, 3]);
  });

  it("counts whoever is waiting", () => {
    expect(seatCounts({ ...tier, game: { seats: 2 } })).toEqual([2, 3]);
  });
});

describe("isMyTier", () => {
  it("matches on the format and the stake together", () => {
    expect(isMyTier(tier, { key: "spingo", stake: 25 })).toBe(true);
    // Same stake, different game.
    expect(isMyTier(tier, { key: "sixmax", stake: 25 })).toBe(false);
    // Same game, different stake.
    expect(isMyTier(tier, { key: "spingo", stake: 50 })).toBe(false);
    expect(isMyTier(tier, null)).toBe(false);
  });
});

describe("tierAction", () => {
  it("offers a seat to somebody who can afford one", () => {
    expect(tierAction(tier, { balance: 500 })).toMatchObject({ kind: "sit", enabled: true });
  });

  it("refuses a seat nobody can pay for, rather than letting the server do it", () => {
    expect(tierAction(huTier, { balance: 5 })).toMatchObject({
      kind: "broke", enabled: false, note: "Not enough coins",
    });
  });

  it("still offers a seat while you are waiting at another tier", () => {
    // The regression this replaces: holding one seat closed every tier in the
    // lobby, so a second registration was impossible.
    expect(tierAction(tier, { balance: 500 })).toMatchObject({ kind: "sit", enabled: true });
  });

  it("becomes a way out of the tier you are seated at", () => {
    const queued = { id: 7, status: "lobby", seats: 2, seats_needed: 3 };
    expect(tierAction(tier, { queued, balance: 500 })).toMatchObject({
      kind: "unregister",
      label: "Unregister",
      enabled: true,
      note: "You are seated · waiting for 1 more",
      game: queued,
    });
  });

  it("offers the way out even to somebody who could no longer afford to sit", () => {
    const queued = { id: 7, status: "lobby", seats: 1, seats_needed: 2 };
    expect(tierAction(huTier, { queued, balance: 0 })).toMatchObject({ kind: "unregister" });
  });
});

describe("myQueueAt and myTablesAt", () => {
  const mine = [
    { id: 3, key: "spingo", stake: 25, status: "running" },
    { id: 5, key: "spingo", stake: 25, status: "lobby" },
    { id: 6, key: "hu", stake: 10, status: "lobby" },
  ];

  it("tells the seat you are waiting on from the game already dealing", () => {
    expect(myQueueAt(tier, mine).id).toBe(5);
    expect(myTablesAt(tier, mine).map((game) => game.id)).toEqual([3]);
  });

  it("has nothing to say about a tier you are not at", () => {
    expect(myQueueAt({ key: "sixmax", stake: 25 }, mine)).toBe(null);
    expect(myTablesAt({ key: "sixmax", stake: 25 }, mine)).toEqual([]);
  });

  it("survives a lobby that has not loaded", () => {
    expect(myQueueAt(tier, undefined)).toBe(null);
  });
});

describe("myTierGames", () => {
  const mine = [
    { id: 3, key: "spingo", stake: 25, status: "running" },
    { id: 4, key: "hu", stake: 10, status: "lobby" },
    { id: 5, key: "spingo", stake: 25, status: "lobby" },
    { id: 6, key: "spingo", stake: 50, status: "lobby" },
  ];

  it("picks out only the games at this tier", () => {
    expect(myTierGames(tier, mine).map((game) => game.id)).toEqual([5, 3]);
  });

  it("puts the queue you are waiting in ahead of the game already dealing", () => {
    const [first] = myTierGames(tier, mine);
    expect(first.status).toBe("lobby");
  });

  it("is empty at a tier you have no seat at", () => {
    expect(myTierGames(huTier, [])).toEqual([]);
    expect(myTierGames(huTier, undefined)).toEqual([]);
  });
});

describe("myGameAction", () => {
  it("offers a way out of a queue, and says how full it is", () => {
    expect(myGameAction({ status: "lobby", seats: 2, seats_needed: 3 })).toEqual({
      kind: "leave", label: "Leave", note: "Waiting · 2 of 3 seated",
    });
  });

  it("offers the table once the cards are out", () => {
    expect(myGameAction({ status: "running" })).toMatchObject({
      kind: "open", label: "Open table",
    });
  });
});

describe("prizeRows", () => {
  it("prints the long odds without trailing zeroes on the short ones", () => {
    const rows = prizeRows({
      odds: [
        { multiplier: 2, chance_pct: 72, prize_coins: 50 },
        { multiplier: 100, chance_pct: 0.05, prize_coins: 2500 },
      ],
    });
    expect(rows.map((row) => row.chance)).toEqual(["72%", "0.05%"]);
  });

  it("is empty for a game that pays places rather than a draw", () => {
    expect(prizeRows(huTier)).toEqual([]);
  });
});

describe("payoutRows", () => {
  it("is what a Sit n Go pays, straight off the wire", () => {
    const rows = payoutRows({ payouts: [{ place: 1, label: "1st", percentage: 65, coins: 97 }] });
    expect(rows[0].coins).toBe(97);
  });

  it("is empty for a drawn game", () => {
    expect(payoutRows(tier)).toEqual([]);
  });
});

describe("prizeRows", () => {
  it("prints the winner's share and marks the rows that pay everybody", () => {
    const rows = prizeRows({
      odds: [
        { multiplier: 2, chance_pct: 68.55, prize_coins: 50, winner_coins: 50, shared: false },
        { multiplier: 100, chance_pct: 0.1, prize_coins: 2500, winner_coins: 2000, shared: true },
      ],
    });
    expect(rows[0]).toMatchObject({ prize: 50, shared: false, chance: "68.55%" });
    expect(rows[1]).toMatchObject({ prize: 2000, shared: true, chance: "0.1%" });
  });

  it("falls back to the pool for a server that sends no share", () => {
    const rows = prizeRows({ odds: [{ multiplier: 2, chance_pct: 70, prize_coins: 50 }] });
    expect(rows[0].prize).toBe(50);
  });
});

describe("hasSharedPrizes", () => {
  it("is true when any row on the ladder pays every seat", () => {
    expect(hasSharedPrizes({ odds: [{ shared: false }, { shared: true }] })).toBe(true);
  });

  it("is false for a ladder that is winner takes all throughout", () => {
    expect(hasSharedPrizes({ odds: [{ shared: false }] })).toBe(false);
    expect(hasSharedPrizes({})).toBe(false);
  });
});
