import { describe, expect, it } from "vitest";

import {
  atStake, freeSeats, isRunning, lobbyOrder, sitBlocker, suggestedBuyIn, tableSummary,
} from "./cashTables";

const table = (over = {}) => ({
  id: 1, stake: "low", seats: 6, taken: 0, big_blind: 5,
  min_buy_in: 100, max_buy_in: 500, my_seat: null, ...over,
});

describe("freeSeats", () => {
  it("is the chairs nobody is in", () => {
    expect(freeSeats(table({ seats: 6, taken: 4 }))).toBe(2);
    expect(freeSeats(table({ seats: 6, taken: 6 }))).toBe(0);
  });

  it("never goes negative on a table that lost a chair", () => {
    expect(freeSeats(table({ seats: 2, taken: 3 }))).toBe(0);
  });
});

describe("isRunning", () => {
  it("is two players, because two players is a game", () => {
    expect(isRunning(table({ taken: 1 }))).toBe(false);
    expect(isRunning(table({ taken: 2 }))).toBe(true);
  });
});

describe("lobbyOrder", () => {
  it("puts the table you are sitting at first, whatever else is going on", () => {
    const rows = [table({ id: 1, taken: 5 }), table({ id: 2, taken: 0, my_seat: 3 })];
    expect(lobbyOrder(rows)[0].id).toBe(2);
  });

  it("puts games ahead of tables waiting, and fuller ahead of emptier", () => {
    const rows = [
      table({ id: 1, taken: 0 }),
      table({ id: 2, taken: 5 }),
      table({ id: 3, taken: 2 }),
    ];
    expect(lobbyOrder(rows).map((one) => one.id)).toEqual([2, 3, 1]);
  });

  it("is a stable read on an empty lobby", () => {
    expect(lobbyOrder([])).toEqual([]);
    expect(lobbyOrder(undefined)).toEqual([]);
  });
});

describe("atStake", () => {
  it("keeps the rungs apart", () => {
    const rows = [table({ id: 1, stake: "low" }), table({ id: 2, stake: "mid" })];
    expect(atStake(rows, "mid").map((one) => one.id)).toEqual([2]);
  });
});

describe("tableSummary", () => {
  it("says the thing that decides whether to sit", () => {
    expect(tableSummary(table({ taken: 0 }))).toBe("Empty — start one");
    expect(tableSummary(table({ taken: 1 }))).toBe("Waiting for one more");
    expect(tableSummary(table({ taken: 4 }))).toBe("4 playing · 2 free");
    expect(tableSummary(table({ taken: 6 }))).toBe("Full");
  });

  it("says so where you are already sitting", () => {
    expect(tableSummary(table({ taken: 3, my_seat: 1 }))).toBe("You are sitting here");
  });
});

describe("suggestedBuyIn", () => {
  it("is fifty big blinds, which is what most people would have typed", () => {
    expect(suggestedBuyIn(table(), 1000)).toBe(250);
  });

  it("comes down to what somebody can actually afford", () => {
    expect(suggestedBuyIn(table(), 180)).toBe(180);
  });

  it("never suggests less than the table takes", () => {
    // An amount that cannot be paid is not a suggestion.
    expect(suggestedBuyIn(table(), 20)).toBe(100);
  });

  it("never suggests more than the table allows", () => {
    expect(suggestedBuyIn(table({ big_blind: 50, max_buy_in: 500 }), 100000)).toBe(500);
  });
});

describe("sitBlocker", () => {
  it("lets somebody sit at a table with room and coins for it", () => {
    expect(sitBlocker(table({ taken: 2 }), 500)).toBe(null);
  });

  it("says what is in the way", () => {
    expect(sitBlocker(table({ taken: 6 }), 500)).toBe("Full");
    expect(sitBlocker(table(), 50)).toBe("Needs 100 to sit down");
  });

  it("never blocks the seat you are already in", () => {
    expect(sitBlocker(table({ taken: 6, my_seat: 2 }), 0)).toBe(null);
  });
});
