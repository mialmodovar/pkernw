import { describe, expect, it } from "vitest";

import {
  HAND_FRESH_MS, handToShow, resumeLabel, seatIsLive, tableToResume,
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
  const hand = { tournamentId: 4, cards: ["As", "Kd"], at: now };

  it("shows a hand from this table", () => {
    expect(handToShow(hand, live, now)).toEqual(["As", "Kd"]);
  });

  it("never shows a hand from another table", () => {
    expect(handToShow({ ...hand, tournamentId: 9 }, live, now)).toEqual([]);
  });

  it("stops showing a hand old enough to have been folded", () => {
    expect(handToShow({ ...hand, at: now - HAND_FRESH_MS - 1 }, live, now)).toEqual([]);
  });

  it("shows nothing when there is nothing remembered", () => {
    expect(handToShow(null, live, now)).toEqual([]);
    expect(handToShow({ ...hand, cards: [] }, live, now)).toEqual([]);
  });
});
