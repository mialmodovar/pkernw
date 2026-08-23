import { describe, expect, it } from "vitest";

import { lateRegLine, tournamentFacts } from "./tournamentFacts";

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
    expect(line()).toBe("22:00 · 1/100 · 8-max · Mystery · 3 paid · late reg L12");
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
    expect(tournamentFacts({}, {})).toEqual(["0/0"]);
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
