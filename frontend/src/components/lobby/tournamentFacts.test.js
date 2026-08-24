import { describe, expect, it } from "vitest";

import { lateRegLine, tournamentFacts, registeredLabel, startsIn } from "./tournamentFacts";

// The row that prompted this: ten facts, three of them money the card was
// already showing in its own column.
const clubNight = {
  status: "lobby",
  player_count: 1,
  max_players: 100,
  players_per_table: 8,
  game_type: "nlh",
  club_name: "Paga Porco",
  league_name: null,
  bounty_mode: "mystery",
  bounty_cents: 250,
  payout_structure: [{}, {}, {}],
  late_reg_level: 12,
};

describe("tournamentFacts", () => {
  const line = (over = {}, options = {}) => tournamentFacts(
    { ...clubNight, ...over },
    { startTime: "22:00", hasPoolFigure: true, ...options },
  ).join(" · ");

  it("says the six things a lobby is scanned for and no more", () => {
    expect(line()).toBe("22:00 · 1 registered · 8-max · Mystery · 3 paid · late reg L12");
  });

  it("counts the players rather than measuring them against the cap", () => {
    // "1/100" reads as a room one per cent full, which is a fact about a
    // number the host typed once rather than about the night.
    expect(line()).not.toContain("1/100");
    expect(line({ player_count: 12, max_players: 100 })).toContain("12 registered");
  });

  it("says how long until it starts, when that is the near answer", () => {
    expect(line({}, { startsInSeconds: 2 * 60 * 60 + 15 * 60 })).toContain("in 2h 15m");
    // And then the clock time is not said twice.
    expect(line({}, { startsInSeconds: 8100 })).not.toContain("22:00");
  });

  it("keeps the clock time for something days away", () => {
    expect(line({}, { startsInSeconds: 3 * 24 * 60 * 60 })).toContain("22:00");
  });

  it("never splits the prize pool, which has a column of its own", () => {
    // "2.50€ to places" beside "Mystery 2.50€" said in halves what the figure
    // beside them says whole.
    expect(line()).not.toMatch(/€/);
  });

  it("names the format of a knockout night without pricing it", () => {
    expect(line({ bounty_mode: "progressive" })).toContain("PKO");
    expect(line({ bounty_mode: "fixed" })).toContain("KO");
    expect(line({ bounty_mode: "none" })).not.toContain("KO");
  });

  it("does not name the only game there is", () => {
    expect(line()).not.toContain("NLH");
  });

  it("does not say 'club night' beside a chip with the club's name on it", () => {
    expect(line()).not.toContain("club night");
  });

  it("does say which league it counts for, which is not the same thing", () => {
    expect(line({ league_name: "Liga de Inverno" })).toContain("Liga de Inverno");
  });

  it("keeps the start time out of a game already being played", () => {
    expect(line({ status: "running" })).not.toContain("22:00");
    expect(line({ status: "finished" })).not.toContain("22:00");
  });

  it("says how long a running one has been going, and how long a finished one took", () => {
    expect(line({ status: "running" }, { elapsed: "42m" })).toContain("42m in");
    expect(line({ status: "finished" }, { elapsed: "1h 20m" })).toContain("took 1h 20m");
  });

  it("says what a game with no pool figure is playing for", () => {
    const free = tournamentFacts(clubNight, { hasPoolFigure: false, prizeLabel: "free" });
    expect(free).toContain("free");
  });

  it("marks a Spin n Go and what it drew", () => {
    const spin = tournamentFacts(
      { ...clubNight, format: "spingo", spin_multiplier: 25, status: "finished" },
      { hasPoolFigure: true },
    );
    expect(spin).toContain("Spin n Go");
    expect(spin).toContain("25×");
  });

  it("has something to say about a row with almost nothing in it", () => {
    expect(tournamentFacts({}, {})).toEqual(["0 registered"]);
  });
});

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
    expect(startsIn(null)).toBe(null);
  });
});

describe("registeredLabel", () => {
  it("counts them", () => {
    expect(registeredLabel(1)).toBe("1 registered");
    expect(registeredLabel(23)).toBe("23 registered");
  });

  it("says nothing odd about an empty one", () => {
    expect(registeredLabel(0)).toBe("0 registered");
    expect(registeredLabel(undefined)).toBe("0 registered");
  });
});
