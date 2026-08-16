import { describe, expect, it } from "vitest";

import {
  boardAt,
  isInBestFive,
  namesBySeat,
  showdownOf,
  streetsOf,
  winningSeats,
} from "./handStreets";

const hand = {
  hand_number: 42,
  community_cards: ["Qd", "7c", "7h", "2s", "3d"],
  pot_total: 4500,
  actions: [
    { username: "ana", seat: 0, street: "preflop", action: "blind", amount: 25 },
    { username: "hero", seat: 3, street: "preflop", action: "raise", amount: 200 },
    { username: "ana", seat: 0, street: "preflop", action: "call", amount: 175 },
    { username: "ana", seat: 0, street: "flop", action: "check", amount: 0 },
    { username: "hero", seat: 3, street: "flop", action: "bet", amount: 400 },
    { username: "ana", seat: 0, street: "flop", action: "call", amount: 400 },
    { username: "ana", seat: 0, street: "turn", action: "check", amount: 0 },
    { username: "hero", seat: 3, street: "turn", action: "bet", amount: 900 },
    { username: "ana", seat: 0, street: "turn", action: "call", amount: 900 },
    { username: "ana", seat: 0, street: "river", action: "check", amount: 0 },
    { username: "hero", seat: 3, street: "river", action: "check", amount: 0 },
  ],
  result: {
    showdown: [
      { seat: 0, cards: ["Ah", "Kd"], hand_name: "Two Pair", best_cards: ["Ah", "Kd", "Qd", "7c", "7h"] },
      { seat: 3, cards: ["Qh", "Qs"], hand_name: "Full House", best_cards: ["Qh", "Qs", "Qd", "7c", "7h"] },
    ],
    awards: [{ seat: 3, amount: 4500, description: "Main pot: Full House" }],
  },
};

describe("boardAt", () => {
  it("shows nothing before the flop", () => {
    expect(boardAt(hand.community_cards, "preflop")).toEqual([]);
  });

  it("grows a card at a time", () => {
    expect(boardAt(hand.community_cards, "flop")).toEqual(["Qd", "7c", "7h"]);
    expect(boardAt(hand.community_cards, "turn")).toEqual(["Qd", "7c", "7h", "2s"]);
    expect(boardAt(hand.community_cards, "river")).toHaveLength(5);
  });

  it("copes with a hand that never reached the river", () => {
    expect(boardAt(["Qd", "7c", "7h"], "river")).toEqual(["Qd", "7c", "7h"]);
  });
});

describe("streetsOf", () => {
  it("runs every street a hand that went the distance was played on", () => {
    expect(streetsOf(hand).map((one) => one.street)).toEqual(["preflop", "flop", "turn", "river"]);
  });

  it("leaves out the streets that never happened", () => {
    // Folded on the flop, so there is no turn and no river — and an empty
    // heading is worse than no heading.
    const short = { community_cards: ["Qd", "7c", "7h"], actions: [
      { street: "preflop", username: "ana", seat: 0, action: "call", amount: 25 },
      { street: "flop", username: "ana", seat: 0, action: "fold", amount: 0 },
    ] };
    expect(streetsOf(short).map((one) => one.street)).toEqual(["preflop", "flop"]);
  });

  it("hands each street the board the players were looking at", () => {
    const [preflop, flop] = streetsOf(hand);
    expect(preflop.board).toEqual([]);
    expect(flop.board).toEqual(["Qd", "7c", "7h"]);
  });

  it("separates the cards a street turned over from the ones already down", () => {
    const river = streetsOf({
      community_cards: ["Qd", "7c", "7h", "2s", "3d"],
      actions: [{ street: "river", username: "ana", seat: 0, action: "check" }],
    }).find((one) => one.street === "river");
    expect(river.dealt).toEqual(["3d"]);
  });

  it("keeps a street that dealt cards but drew no action", () => {
    // Everyone is all in: the board runs out with nobody acting on it, and a
    // replay that dropped those streets would not show the cards that decided
    // the hand.
    const runout = streetsOf({
      community_cards: ["Qd", "7c", "7h", "2s", "3d"],
      actions: [{ street: "preflop", username: "ana", seat: 0, action: "call", amount: 900 }],
    });
    expect(runout.map((one) => one.street)).toEqual(["preflop", "flop", "turn", "river"]);
  });
});

describe("winningSeats", () => {
  it("is whoever was paid", () => {
    expect([...winningSeats(hand)]).toEqual([3]);
  });

  it("is empty for a hand with no awards recorded", () => {
    expect(winningSeats({}).size).toBe(0);
  });
});

describe("namesBySeat", () => {
  it("reads the names off the actions, which are the only place they are", () => {
    expect(namesBySeat(hand).get(3)).toBe("hero");
  });
});

describe("showdownOf", () => {
  it("puts the winning hand first", () => {
    expect(showdownOf(hand).map((one) => one.seat)).toEqual([3, 0]);
  });
});

describe("isInBestFive", () => {
  it("knows which cards made the hand", () => {
    const winner = hand.result.showdown[1];
    expect(isInBestFive(winner, "Qd")).toBe(true);
    expect(isInBestFive(winner, "2s")).toBe(false);
  });
});
