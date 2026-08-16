import { describe, expect, it } from "vitest";

import { backersOf, contenders, isOnTheRail, recordLabel, sideBetState } from "./sideBets";

const table = [
  { seat: 0, user_id: 10, name: "Ana" },
  { seat: 1, user_id: 11, name: "Bea", is_folded: true },
  { seat: 2, user_id: 12, name: "Cid" },
  { seat: 3, user_id: 13, name: "Dee", is_eliminated: true },
];

describe("contenders", () => {
  it("is everyone still contesting the pot", () => {
    expect(contenders(table).map((p) => p.name)).toEqual(["Ana", "Cid"]);
  });

  it("leaves out anyone sitting the hand out", () => {
    const out = [...table, { seat: 4, user_id: 14, name: "Eve", is_sitting_out: true }];
    expect(contenders(out).map((p) => p.name)).toEqual(["Ana", "Cid"]);
  });
});

describe("isOnTheRail", () => {
  it("is true once you have folded", () => {
    expect(isOnTheRail(table, 1)).toBe(true);
  });

  it("is false while you are still in it", () => {
    expect(isOnTheRail(table, 0)).toBe(false);
  });

  it("is true for a seat that is not at this table at all", () => {
    expect(isOnTheRail(table, 99)).toBe(true);
  });
});

describe("sideBetState", () => {
  it("offers the contenders to a player who has folded", () => {
    const state = sideBetState({ players: table, mySeat: 1, open: true, myUserId: 11 });
    expect(state.mode).toBe("picking");
    expect(state.contenders.map((p) => p.name)).toEqual(["Ana", "Cid"]);
  });

  it("offers nothing to a player still in the hand", () => {
    expect(sideBetState({ players: table, mySeat: 0, open: true, myUserId: 10 }).mode).toBeNull();
  });

  it("offers nothing once the cards are face up", () => {
    expect(sideBetState({ players: table, mySeat: 1, open: false, myUserId: 11 }).mode).toBeNull();
  });

  it("offers nothing when only one player is left to back", () => {
    const heads = [table[0], { ...table[2], is_folded: true }];
    expect(sideBetState({ players: heads, mySeat: 2, open: true, myUserId: 12 }).mode).toBeNull();
  });

  it("holds the call you already made", () => {
    const state = sideBetState({
      players: table,
      mySeat: 1,
      open: true,
      myUserId: 11,
      bets: [{ user_id: 11, on_user_id: 10, on_name: "Ana" }],
    });
    expect(state.mode).toBe("waiting");
    expect(state.myBet.on_name).toBe("Ana");
  });

  it("reads out the results to everyone, whether they called or not", () => {
    const state = sideBetState({
      players: table,
      mySeat: 0,
      myUserId: 10,
      results: [{ user_id: 11, on_name: "Ana", correct: true }],
    });
    expect(state.mode).toBe("results");
  });

  it("puts the results ahead of the call that produced them", () => {
    const state = sideBetState({
      players: table,
      mySeat: 1,
      myUserId: 11,
      bets: [{ user_id: 11, on_user_id: 10 }],
      results: [{ user_id: 11, on_name: "Ana", correct: true }],
    });
    expect(state.mode).toBe("results");
  });

  it("gives a spectator the results and nothing else", () => {
    const watching = { players: table, mySeat: null, open: true, myUserId: null, canCall: false };
    expect(sideBetState(watching).mode).toBeNull();
    expect(sideBetState({ ...watching, results: [{ user_id: 11, correct: true }] }).mode).toBe("results");
  });
});

describe("recordLabel", () => {
  it("says how many of how many", () => {
    expect(recordLabel({ right: 3, called: 7 })).toBe("3 of 7 called");
  });

  it("says nothing to somebody who has never called one", () => {
    expect(recordLabel({ right: 0, called: 0 })).toBeNull();
    expect(recordLabel(undefined)).toBeNull();
  });
});

describe("backersOf", () => {
  it("finds who is on a seat", () => {
    const bets = [{ user_id: 11, on_seat: 0, name: "Bea" }, { user_id: 14, on_seat: 2, name: "Eve" }];
    expect(backersOf(bets, 0).map((b) => b.name)).toEqual(["Bea"]);
  });
});
