import { describe, expect, it } from "vitest";

import {
  HAND_FRESH_MS, handToShow, liveSeats, openTableTabs, resumeLabel, seatIsLive,
  shortcutHiddenOn, tableToResume,
} from "./resumeTable";

const live = { id: 4, is_joined: true, status: "running", my_finish_position: null, name: "Friday" };

describe("seatIsLive", () => {
  it("is a seat of yours that is being dealt to", () => {
    expect(seatIsLive(live)).toBe(true);
    expect(seatIsLive({ ...live, status: "paused" })).toBe(true);
  });

  it("is not a tournament you are only looking at", () => {
    expect(seatIsLive({ ...live, is_joined: false })).toBe(false);
  });

  it("is not a seat you have already busted out of", () => {
    expect(seatIsLive({ ...live, my_finish_position: 3 })).toBe(false);
  });

  it("is not a lobby that has not started", () => {
    expect(seatIsLive({ ...live, status: "lobby" })).toBe(false);
  });
});

describe("tableToResume", () => {
  it("is nothing when you are sitting at nothing", () => {
    expect(tableToResume([{ ...live, is_joined: false }])).toBeNull();
    expect(tableToResume()).toBeNull();
  });

  it("offers the newest of two live seats", () => {
    const older = { ...live, id: 2 };
    expect(tableToResume([older, live]).id).toBe(4);
  });

  it("offers the one you were last at, whichever is newest", () => {
    const older = { ...live, id: 2 };
    expect(tableToResume([older, live], 2).id).toBe(2);
  });

  it("falls back to the newest when the last one is over", () => {
    const older = { ...live, id: 2 };
    expect(tableToResume([older, live], 99).id).toBe(4);
  });
});

describe("liveSeats", () => {
  it("is every table you are seated at, newest first", () => {
    const older = { ...live, id: 2 };
    const finished = { ...live, id: 3, my_finish_position: 2 };
    expect(liveSeats([older, live, finished]).map((one) => one.id)).toEqual([4, 2]);
  });
});

describe("resumeLabel", () => {
  it("names a tournament", () => {
    expect(resumeLabel(live)).toBe("Friday");
  });

  it("says the stake for a Spin n Go, which has no name worth reading", () => {
    expect(resumeLabel({ ...live, format: "spingo", buy_in_coins: 25 })).toBe("Spin n Go · 🪙 25");
  });

  it("says which Sit n Go, since there are two of them", () => {
    expect(resumeLabel({ ...live, format: "sitngo", players_per_table: 2, buy_in_coins: 10 }))
      .toBe("Sit n Go · Heads up · 🪙 10");
    expect(resumeLabel({ ...live, format: "sitngo", players_per_table: 6, buy_in_coins: 25 }))
      .toBe("Sit n Go · 6-max · 🪙 25");
  });
});

describe("handToShow", () => {
  const now = 1_000_000;
  const hands = { 4: { cards: ["As", "Kd"], at: now } };

  it("shows a hand from this table", () => {
    expect(handToShow(hands, live, now)).toEqual(["As", "Kd"]);
  });

  it("never shows a hand from another table", () => {
    // Three tables open at once is ordinary, and each keeps its own hand.
    const many = { ...hands, 9: { cards: ["2c", "7d"], at: now } };
    expect(handToShow(many, { ...live, id: 9 }, now)).toEqual(["2c", "7d"]);
    expect(handToShow(many, { ...live, id: 5 }, now)).toEqual([]);
  });

  it("stops showing a hand old enough to have been folded", () => {
    expect(handToShow({ 4: { cards: ["As", "Kd"], at: now - HAND_FRESH_MS - 1 } }, live, now))
      .toEqual([]);
  });

  it("shows nothing when there is nothing remembered", () => {
    expect(handToShow(null, live, now)).toEqual([]);
    expect(handToShow({ 4: { cards: [], at: now } }, live, now)).toEqual([]);
  });
});

describe("openTableTabs", () => {
  const seat = { id: 4, is_joined: true, status: "running", my_finish_position: null, name: "Friday" };
  const watch = { id: 9, table: 2, name: "Sunday Rewind" };

  it("draws nothing but the seats when nothing is being watched", () => {
    expect(openTableTabs([seat], []).map((one) => one.kind)).toEqual(["seat"]);
  });

  it("puts the seats first, newest first, then what you are watching", () => {
    const older = { ...seat, id: 2, name: "Tuesday" };
    const tabs = openTableTabs([older, seat], [watch]);

    expect(tabs.map((one) => one.id)).toEqual([4, 2, 9]);
    expect(tabs.map((one) => one.kind)).toEqual(["seat", "seat", "watch"]);
  });

  it("never draws one table twice", () => {
    // Sat down at a table you had been watching: it is one game, and the seat
    // is the truer of the two.
    const tabs = openTableTabs([seat], [{ id: 4, table: 1, name: "Friday" }]);

    expect(tabs).toHaveLength(1);
    expect(tabs[0].kind).toBe("seat");
  });

  it("leaves out a seat you have already busted out of", () => {
    const busted = { ...seat, id: 7, my_finish_position: 3 };
    expect(openTableTabs([seat, busted], []).map((one) => one.id)).toEqual([4]);
  });

  it("names a watched table even when nothing named it", () => {
    expect(openTableTabs([], [{ id: 9, table: 3 }])[0].label).toBe("Table 3");
  });

  it("carries the table number a watched tab has to go back to", () => {
    expect(openTableTabs([], [watch])[0].table).toBe(2);
  });
});

describe("shortcutHiddenOn", () => {
  it("is hidden at the table it would take you to", () => {
    // A door drawn on the inside of the room it opens into.
    expect(shortcutHiddenOn("/tournament/12/play")).toBe(true);
    expect(shortcutHiddenOn("/tournament/12/watch")).toBe(true);
  });

  it("is hidden at any table, including the sandbox and a cash table", () => {
    // Both render the same felt. Every route that draws one has to be here.
    expect(shortcutHiddenOn("/dev/table")).toBe(true);
    expect(shortcutHiddenOn("/cash/7")).toBe(true);
  });

  it("is hidden where nobody is signed in", () => {
    for (const path of ["/login", "/register", "/recover"]) {
      expect(shortcutHiddenOn(path), path).toBe(true);
    }
  });

  it("shows everywhere a player might wander off to", () => {
    for (const path of ["/", "/clubs", "/clubs/quinta", "/tournament/12", "/tournaments/new"]) {
      expect(shortcutHiddenOn(path), path).toBe(false);
    }
  });

  it("survives a path that has not arrived", () => {
    expect(shortcutHiddenOn(undefined)).toBe(false);
  });
});
