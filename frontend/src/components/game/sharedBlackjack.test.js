import { describe, expect, it } from "vitest";

import {
  SEAT_COUNT, betLimits, canBet, canSit, dealerTableLine, isSeated, mySeat, myHand,
  occupancy, phaseLine, seatState, seatStates, secondsLeft, settledSeats, tableActions,
} from "./sharedBlackjack";

/** A hand as the server sends one, with only the fields a test cares about. */
const hand = (over = {}) => ({
  cards: ["Ts", "9d"],
  total: 19,
  soft: false,
  stake: 25,
  doubled: false,
  from_split: false,
  status: "playing",
  outcome: null,
  returned: 0,
  can: { hit: true, stand: true, double: true, split: false },
  ...over,
});

const player = (name = "ana") => ({ username: name, display_name: name });

/** A table payload with `seats` filled out to eight, as the server always sends. */
const table = (over = {}) => ({
  phase: "betting",
  ends_in: 8,
  round: 4,
  min_bet: 5,
  max_bet: 500,
  my_seat: null,
  dealer: { cards: [], total: 0, soft: false, blackjack: false },
  ...over,
  seats: Array.from({ length: 8 }, (_, index) => ({
    seat: index, player: null, bet: 0, hands: [], net: 0, idle_rounds: 0,
    ...((over.seats || []).find((one) => one.seat === index) || {}),
  })),
});

describe("secondsLeft", () => {
  it("never counts past zero, because the client prints it", () => {
    expect(secondsLeft(table({ ends_in: 0 }))).toBe(0);
    expect(secondsLeft(table({ ends_in: -3 }))).toBe(0);
  });

  it("survives a table that has not loaded", () => {
    expect(secondsLeft(null)).toBe(null);
  });
});

describe("phaseLine", () => {
  it("counts the betting window down, because that is the window you can miss", () => {
    expect(phaseLine(table({ phase: "betting", ends_in: 7.4 })))
      .toMatchObject({ label: "Place your bets" });
  });

  it("says the dealer is dealing before any card is out", () => {
    // A "Playing" with an empty felt reads as a table that has stopped.
    expect(phaseLine(table({ phase: "playing" })).label).toBe("Dealing");
  });

  it("says something rather than nothing before the table has loaded", () => {
    expect(phaseLine(null).label).toBeTruthy();
    expect(phaseLine(undefined).label).toBeTruthy();
  });
});

describe("canSit", () => {
  it("lets you into an empty chair", () => {
    expect(canSit(table(), 3, 500)).toEqual({ allowed: true, reason: null });
  });

  it("refuses a chair somebody is in, and says which is which", () => {
    const busy = table({ seats: [{ seat: 3, player: player() }] });
    expect(canSit(busy, 3, 500)).toMatchObject({ allowed: false });
    expect(canSit(busy, 4, 500)).toMatchObject({ allowed: true });
  });

  it("refuses a second seat for one player", () => {
    // Eight chairs is few enough that one person holding two is one fewer
    // person who can play at all.
    const seated = table({ my_seat: 0, seats: [{ seat: 0, player: player("me") }] });
    expect(canSit(seated, 5, 500)).toMatchObject({ allowed: false });
  });

  it("refuses somebody who cannot cover the smallest bet", () => {
    expect(canSit(table(), 1, 2)).toMatchObject({ allowed: false, reason: "Not enough coins" });
  });

  it("refuses a seat that does not exist, and a table that has not loaded", () => {
    expect(canSit(table(), 99, 500).allowed).toBe(false);
    expect(canSit(null, 0, 500).allowed).toBe(false);
  });
});

describe("canBet", () => {
  const seated = (over = {}) => table({
    phase: "betting",
    my_seat: 2,
    seats: [{ seat: 2, player: player("me"), ...over }],
  });

  it("takes a bet inside the limits from a seated player", () => {
    expect(canBet(seated(), 25, 500)).toMatchObject({ allowed: true });
  });

  it("refuses one the wallet cannot cover", () => {
    expect(canBet(seated(), 100, 40)).toMatchObject({ allowed: false });
  });

  it("refuses one outside the table's limits", () => {
    expect(canBet(seated(), 1, 500).allowed).toBe(false);
    expect(canBet(seated(), 5000, 9999).allowed).toBe(false);
  });

  it("refuses a second bet on a round already paid into", () => {
    // Topping up would be a raise, which this table does not offer, and
    // replacing would mean refunding coins that have already gone.
    expect(canBet(seated({ bet: 25 }), 25, 500)).toMatchObject({ allowed: false });
  });

  it("refuses one outside the betting window", () => {
    const playing = table({
      phase: "playing", my_seat: 2, seats: [{ seat: 2, player: player("me") }],
    });
    expect(canBet(playing, 25, 500)).toMatchObject({ allowed: false });
  });

  it("refuses one from somebody who is not sitting down", () => {
    expect(canBet(table({ phase: "betting" }), 25, 500)).toMatchObject({ allowed: false });
  });
});

describe("tableActions", () => {
  it("offers only what your own hand's `can` allows, in a fixed order", () => {
    const playing = table({
      phase: "playing",
      my_seat: 1,
      seats: [{ seat: 1, player: player("me"), bet: 25, hands: [hand()] }],
    });
    const buttons = tableActions(playing);

    expect(buttons.map((one) => one.key)).toEqual(["hit", "stand", "double", "split"]);
    // A button that moves between hands is a button pressed by accident, so
    // the unavailable one is drawn dead rather than removed.
    expect(buttons.find((one) => one.key === "split").enabled).toBe(false);
    expect(buttons.find((one) => one.key === "hit").enabled).toBe(true);
  });

  it("offers nothing at all when you have no seat in the round", () => {
    expect(tableActions(table({ phase: "playing" })).every((one) => !one.enabled)).toBe(true);
    expect(tableActions(null).every((one) => !one.enabled)).toBe(true);
  });
});

describe("seatState", () => {
  it("knows an empty chair from an occupied one", () => {
    const one = table({ seats: [{ seat: 0, player: player() }] });
    expect(seatState(0, one).empty).toBe(false);
    expect(seatState(1, one).empty).toBe(true);
  });

  it("marks the chair that is yours", () => {
    const one = table({ my_seat: 6, seats: [{ seat: 6, player: player("me") }] });
    expect(seatState(6, one).mine).toBe(true);
    expect(seatState(0, one).mine).toBe(false);
  });

  it("says a seated player has not bet yet while the window is open", () => {
    const one = table({ phase: "betting", seats: [{ seat: 0, player: player() }] });
    expect(seatState(0, one).waiting).toBe(true);
  });

  it("draws a settled seat with the same mark the history strip uses", () => {
    const one = table({
      phase: "settling",
      seats: [{
        seat: 0, player: player(), bet: 25, net: 25,
        hands: [hand({ status: "stood", outcome: "win", returned: 50 })],
      }],
    });
    expect(seatState(0, one).mark).toMatchObject({ label: "W" });
    expect(seatState(0, one).netLabel).toBe("+25");
  });

  it("draws all eight chairs before anybody is in any of them", () => {
    expect(seatStates(table())).toHaveLength(SEAT_COUNT);
    expect(seatStates(null)).toHaveLength(SEAT_COUNT);
  });
});

describe("mySeat and myHand", () => {
  it("finds your row, and nothing when you have no chair", () => {
    const one = table({ my_seat: 4, seats: [{ seat: 4, player: player("me"), hands: [hand()] }] });
    expect(mySeat(one).seat).toBe(4);
    expect(myHand(one).total).toBe(19);
    expect(isSeated(one)).toBe(true);

    expect(mySeat(table())).toBe(null);
    expect(isSeated(table())).toBe(false);
    expect(myHand(table())).toBe(null);
  });
});

describe("dealerTableLine", () => {
  it("holds the total back while a card is still face down", () => {
    const playing = table({
      phase: "playing",
      dealer: { cards: ["Kd", "??"], total: 10, soft: false, blackjack: false },
    });
    // The client is only ever told the up card's total; saying the real one
    // would give the hole card away by subtraction.
    expect(dealerTableLine(playing)).toContain("10");
  });

  it("says the whole thing once the dealer has turned over", () => {
    const settling = table({
      phase: "settling",
      dealer: { cards: ["Kd", "8h", "5s"], total: 23, soft: false, blackjack: false },
    });
    expect(dealerTableLine(settling)).toContain("23");
    expect(dealerTableLine(settling)).toContain("Bust");
  });
});

describe("the heading figures", () => {
  it("counts who is actually sitting down", () => {
    const two = table({ seats: [{ seat: 0, player: player() }, { seat: 5, player: player("b") }] });
    expect(occupancy(two)).toBe("2 of 8 seated");
    expect(occupancy(table())).toBe("0 of 8 seated");
  });

  it("reads the limits off the table, and has an answer before it loads", () => {
    expect(betLimits(table({ min_bet: 10, max_bet: 250 }))).toEqual({ min: 10, max: 250 });
    expect(betLimits(null)).toEqual({ min: 5, max: 500 });
  });

  it("lists the seats with a result to show once the dealer has played", () => {
    const one = table({
      phase: "settling",
      seats: [
        { seat: 0, player: player(), bet: 25, net: 25, hands: [hand({ outcome: "win" })] },
        { seat: 1, player: player("b") },
      ],
    });
    expect(settledSeats(one).map((seat) => seat.seat)).toEqual([0]);
    expect(settledSeats(table())).toEqual([]);
  });
});
