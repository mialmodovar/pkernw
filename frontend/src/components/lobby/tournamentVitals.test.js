import { describe, expect, it } from "vitest";

import { countdownLabel, tournamentVitals, vitalsSummary } from "./tournamentVitals";

const running = {
  status: "running",
  players: [
    { username: "a", chips: 30000, is_eliminated: false },
    { username: "b", chips: 10000, is_eliminated: false },
    { username: "c", chips: 0, is_eliminated: true },
  ],
  payout_structure: [{ place: 1 }, { place: 2 }],
  late_registration_seconds_left: 500,
};

describe("countdownLabel", () => {
  it("reads as a clock under the hour", () => {
    expect(countdownLabel(500)).toBe("8:20");
    expect(countdownLabel(9)).toBe("0:09");
  });

  it("switches to hours when there are hours of it", () => {
    expect(countdownLabel(3900)).toBe("1h 05m");
  });

  it("says nothing when there is nothing to say", () => {
    expect(countdownLabel(null)).toBeNull();
    expect(countdownLabel(-1)).toBeNull();
  });
});

describe("tournamentVitals", () => {
  it("counts the living against everyone who sat down", () => {
    const v = tournamentVitals(running);
    expect(v.playersLeft).toBe(2);
    expect(v.entrants).toBe(3);
  });

  it("averages the chips over the players still holding them", () => {
    expect(tournamentVitals(running).averageStack).toBe(20000);
  });

  it("prefers the table's count to the snapshot's", () => {
    // A knockout lands on the socket seconds before the REST poll catches up.
    expect(tournamentVitals(running, { playersLeft: 1 }).playersLeft).toBe(1);
  });

  it("has no average stack for a list row, which carries no stacks", () => {
    const row = { status: "running", player_count: 12, payout_structure: [{ place: 1 }] };
    const v = tournamentVitals(row);
    expect(v.averageStack).toBeNull();
    expect(v.playersLeft).toBe(12);
    expect(v.entrants).toBe(12);
  });

  it("does not count survivors before anyone has played", () => {
    expect(tournamentVitals({ status: "lobby", player_count: 6 }).started).toBe(false);
  });
});

describe("vitalsSummary", () => {
  it("says the four things in the one order", () => {
    expect(vitalsSummary(tournamentVitals(running)).map((r) => `${r.label} ${r.value}`))
      .toEqual(["Players 2/3", "Avg stack 20,000", "Places paid 2", "Late reg 8:20"]);
  });

  it("drops what a tournament has no answer for", () => {
    const v = tournamentVitals({ status: "lobby", player_count: 6 });
    expect(vitalsSummary(v)).toEqual([]);
  });

  it("carries a short wording for a header that has one line", () => {
    expect(vitalsSummary(tournamentVitals(running)).map((r) => r.short))
      .toEqual(["2/3 left", "20,000 avg", "2 paid", "late reg 8:20"]);
  });

  it("lets the table format stacks its own way", () => {
    const rows = vitalsSummary(tournamentVitals(running), { formatStack: (n) => `${n / 1000}k` });
    expect(rows.find((r) => r.key === "avg").value).toBe("20k");
  });
});
