import { describe, expect, it } from "vitest";

import {
  formatMeta, isMyTier, payoutRows, prizeRows, prizeSummary, seatCounts, seatPips, tierAction,
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
        { multiplier: 2, prize_coins: 50 },
        { multiplier: 10, prize_coins: 250 },
        { multiplier: 100, prize_coins: 2500 },
      ],
    };
    expect(prizeSummary(drawn, { draws_multiplier: true })).toEqual({
      label: "Prize", value: "🪙 50 – 🪙 2,500",
    });
  });

  it("names the winner's share where one place is paid", () => {
    const hu = { payouts: [{ place: 1, label: "1st", percentage: 100, coins: 20 }] };
    expect(prizeSummary(hu, { draws_multiplier: false })).toEqual({
      label: "Winner takes", value: "🪙 20",
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
      label: "Top 2 paid", value: "🪙 97 · 🪙 52",
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

  it("turns into a way out of a tier you are waiting in", () => {
    const mine = { key: "spingo", stake: 25, status: "lobby" };
    expect(tierAction(tier, { mine, balance: 500 })).toMatchObject({ kind: "leave", enabled: true });
  });

  it("sends you to the table once your own game is running", () => {
    const mine = { key: "spingo", stake: 25, status: "running" };
    expect(tierAction(tier, { mine, balance: 500 })).toMatchObject({ kind: "open", enabled: true });
  });

  it("closes every other tier while you are in one, and says which", () => {
    const mine = { key: "hu", stake: 50, status: "lobby", label: "Heads Up" };
    expect(tierAction(tier, { mine, balance: 500 })).toMatchObject({
      kind: "busy", enabled: false, note: "You are already in a Heads Up",
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
