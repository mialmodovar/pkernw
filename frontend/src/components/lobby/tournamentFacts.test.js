import { describe, expect, it } from "vitest";

import { BOUNTY_LABELS, lateRegLine, SOON_SECONDS, startsIn } from "./tournamentFacts";

// The tournamentFacts() tests that used to head this file went with the
// function. They asserted the contents of a joined string that no longer
// exists, and three of them asserted things no player could see: that the game
// label never appears (GAME_LABELS was permanently empty), and that a Spin n Go
// is marked and priced (this list only ever renders format === "standard", so
// that branch was unreachable from it). What survives is the vocabulary, and
// which fact goes where is now tested in tournamentRow.test.js.

describe("lateRegLine", () => {
  it("is the level while nothing is running", () => {
    expect(lateRegLine({ status: "lobby", late_reg_level: 12 }, null, false)).toBe("late reg L12");
  });

  it("becomes a countdown once the clock is, because that is the real question", () => {
    expect(lateRegLine(
      { status: "running", late_registration_open: true, late_reg_level: 12 }, 500, false,
    )).toBe("late reg 8:20");
  });

  it("is nothing once you cannot act on it", () => {
    expect(lateRegLine({ status: "running", late_reg_level: 12 }, null, false)).toBe(null);
    expect(lateRegLine({ status: "lobby", late_reg_level: 12 }, null, true)).toBe(null);
    expect(lateRegLine({ status: "lobby", late_reg_level: 0 }, null, false)).toBe(null);
  });

  it("survives being handed nothing at all", () => {
    expect(lateRegLine(null, null, false)).toBe(null);
  });
});

describe("startsIn", () => {
  it("is minutes while it is minutes away", () => {
    expect(startsIn(12 * 60)).toBe("in 12 min");
    expect(startsIn(59 * 60)).toBe("in 59 min");
  });

  it("is hours and minutes beyond that", () => {
    expect(startsIn(2 * 60 * 60 + 5 * 60)).toBe("in 2h 05m");
    expect(startsIn(3 * 60 * 60)).toBe("in 3h");
  });

  it("says so when it is about to happen", () => {
    expect(startsIn(8)).toBe("starting now");
  });

  it("gives up on anything more than half a day out", () => {
    // The clock time is the better answer there, and the list is grouped by
    // day, so the day is already above it.
    expect(startsIn(20 * 60 * 60)).toBe(null);
    expect(startsIn(SOON_SECONDS + 1)).toBe(null);
    expect(startsIn(null)).toBe(null);
  });

  it("still answers right up to the edge of that", () => {
    expect(startsIn(SOON_SECONDS)).toBe("in 12h");
  });
});

describe("BOUNTY_LABELS", () => {
  it("names each kind of knockout night without pricing it", () => {
    // The word is a rule. What the heads are worth is money, and money has a
    // column of its own on the row.
    expect(BOUNTY_LABELS).toEqual({ progressive: "PKO", mystery: "Mystery", fixed: "KO" });
  });
});
