import { describe, expect, it } from "vitest";

import {
  atStake, defaultSeat, freeSeats, isRunning, lobbyOrder, seatOptions, sitBlocker,
  rowActions, suggestedBuyIn, tableSummary, waitingLine,
} from "./cashTables";

const table = (over = {}) => ({
  id: 1, stake: "low", seats: 6, taken: 0, big_blind: 5,
  min_buy_in: 250, max_buy_in: 500, my_seat: null, ...over,
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
  it("is the middle of the range, which is what most people would have typed", () => {
    expect(suggestedBuyIn(table(), 1000)).toBe(375);
  });

  it("comes down to what somebody can actually afford", () => {
    expect(suggestedBuyIn(table(), 300)).toBe(300);
  });

  it("never suggests less than the table takes", () => {
    // An amount that cannot be paid is not a suggestion.
    expect(suggestedBuyIn(table(), 20)).toBe(250);
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
    expect(sitBlocker(table(), 50)).toBe("Needs 250 to sit down");
  });

  it("never blocks the seat you are already in", () => {
    expect(sitBlocker(table({ taken: 6, my_seat: 2 }), 0)).toBe(null);
  });
});

describe("waitingLine", () => {
  it("says nothing once there are two to deal to", () => {
    expect(waitingLine({ seated: 2, dealable: 2, seats: 6 })).toBe("");
  });

  it("asks for one more when you are the only one here", () => {
    expect(waitingLine({ seated: 1, dealable: 1, seats: 6 }))
      .toMatch(/another player to sit down/);
  });

  it("distinguishes an empty table from one that is sitting out", () => {
    const alone = waitingLine({ seated: 1, dealable: 1, seats: 6 });
    const satOut = waitingLine({ seated: 3, dealable: 1, seats: 6 });
    expect(satOut).not.toBe(alone);
    expect(satOut).toMatch(/sitting out/);
  });

  it("says when a chair is taken by somebody who is not there", () => {
    // Two seated and no hand being dealt reads as broken. What is actually
    // happening is that one of them has left the page.
    const line = waitingLine({ seated: 2, dealable: 1, away: 1, seats: 6 });
    expect(line).toMatch(/away from the table/);
  });

  it("says nothing once two people are actually there", () => {
    expect(waitingLine({ seated: 3, dealable: 2, away: 1, seats: 6 })).toBe("");
  });

  it("has nothing to say about a table that never spoke", () => {
    expect(waitingLine(null)).toBe("");
  });
});

describe("seatOptions", () => {
  const table = {
    seats: 4,
    my_seat: 2,
    players: [
      { seat: 0, username: "ana", display_name: "Ana" },
      { seat: 2, username: "bea", display_name: "" },
    ],
  };

  it("lists every chair, in order", () => {
    expect(seatOptions(table).map((one) => one.seat)).toEqual([0, 1, 2, 3]);
  });

  it("numbers them from one for the person reading them", () => {
    expect(seatOptions(table)[0].label).toBe("Seat 1");
    expect(seatOptions(table)[3].label).toBe("Seat 4");
  });

  it("says who is sitting where", () => {
    const [first, second] = seatOptions(table);
    expect(first.taken).toBe(true);
    expect(first.name).toBe("Ana");
    expect(second.taken).toBe(false);
    expect(second.name).toBe("");
  });

  it("falls back to the username when somebody has no display name", () => {
    expect(seatOptions(table)[2].name).toBe("bea");
  });

  it("knows which chair is yours", () => {
    expect(seatOptions(table).filter((one) => one.mine).map((one) => one.seat)).toEqual([2]);
  });

  it("has no chairs at all for no table", () => {
    expect(seatOptions(null)).toEqual([]);
  });
});

describe("defaultSeat", () => {
  it("offers the first chair nobody is in", () => {
    expect(defaultSeat({ seats: 4, players: [{ seat: 0, username: "ana" }] })).toBe(1);
  });

  it("offers nothing at a full table", () => {
    const full = { seats: 2, players: [{ seat: 0, username: "a" }, { seat: 1, username: "b" }] };
    expect(defaultSeat(full)).toBeNull();
  });
});

describe("rowActions", () => {
  it("offers a seat and the rail at a table with a game and room", () => {
    expect(rowActions(table({ taken: 3 }), 1000)).toMatchObject({ sit: "Sit down", watch: true });
  });

  it("offers only the rail at a full table", () => {
    const full = table({ seats: 6, taken: 6 });
    expect(rowActions(full, 1000)).toMatchObject({ sit: null, watch: true, blocked: "Full" });
  });

  it("offers only the rail to somebody who cannot afford the table", () => {
    expect(rowActions(table({ taken: 4 }), 10)).toMatchObject({ sit: null, watch: true });
  });

  it("has nothing to watch at a table nobody is playing at", () => {
    expect(rowActions(table({ taken: 1 }), 1000)).toMatchObject({ sit: "Sit down", watch: false });
  });

  it("says nothing to somebody already sitting there", () => {
    expect(rowActions(table({ my_seat: 3, taken: 4 }), 1000))
      .toEqual({ sit: null, watch: false, seated: true });
  });
});
