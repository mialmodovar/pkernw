import { describe, expect, it } from "vitest";

import { prizeRows, seatCounts, tierAction, tierBlurb } from "./spinGoTiers";

const tier = { stake: 25, seats_needed: 3, big_blinds: 15, game: null, odds: [] };

describe("tierBlurb", () => {
  it("says what the format is", () => {
    expect(tierBlurb(tier)).toBe("3-max · 15bb · 3-5 min");
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

describe("tierAction", () => {
  it("offers a seat to somebody who can afford one", () => {
    expect(tierAction(tier, { balance: 500 })).toMatchObject({ kind: "sit", enabled: true });
  });

  it("refuses a seat nobody can pay for, rather than letting the server do it", () => {
    expect(tierAction(tier, { balance: 10 })).toMatchObject({
      kind: "broke", enabled: false, note: "Not enough coins",
    });
  });

  it("turns into a way out of a tier you are waiting in", () => {
    const mine = { stake: 25, status: "lobby" };
    expect(tierAction(tier, { mine, balance: 500 })).toMatchObject({ kind: "leave", enabled: true });
  });

  it("sends you to the table once your own game is running", () => {
    const mine = { stake: 25, status: "running" };
    expect(tierAction(tier, { mine, balance: 500 })).toMatchObject({ kind: "open", enabled: true });
  });

  it("closes the other tier while you are in one, and says which", () => {
    const mine = { stake: 50, status: "lobby" };
    expect(tierAction(tier, { mine, balance: 500 })).toMatchObject({
      kind: "busy", enabled: false, note: "You are already in the 50 table",
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
});
