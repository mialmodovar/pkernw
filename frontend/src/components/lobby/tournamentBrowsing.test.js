import { describe, it, expect } from "vitest";

import {
  dayLabel,
  filterTournaments,
  groupByDay,
  sortTournaments,
  tournamentPriority,
  PRIORITY,
} from "./tournamentBrowsing";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-08-15T12:00:00Z").getTime();

const make = (overrides) => ({
  id: Math.random(),
  name: "Game",
  host_name: "host",
  status: "lobby",
  is_joined: false,
  late_registration_open: false,
  scheduled_start_at: null,
  created_at: new Date(NOW).toISOString(),
  ...overrides,
});

describe("priority", () => {
  it("puts a game you are already playing above everything", () => {
    expect(tournamentPriority(make({ status: "running", is_joined: true }))).toBe(PRIORITY.live);
  });

  it("puts late registration above a tournament that has not started", () => {
    const late = make({ status: "running", late_registration_open: true });
    const open = make({ status: "lobby" });
    expect(tournamentPriority(late)).toBeLessThan(tournamentPriority(open));
  });

  it("puts finished tournaments last", () => {
    expect(tournamentPriority(make({ status: "finished" }))).toBe(PRIORITY.finished);
  });
});

describe("sortTournaments", () => {
  it("orders by priority before time", () => {
    const soon = make({ name: "soon", scheduled_start_at: new Date(NOW + HOUR).toISOString() });
    const late = make({ name: "late", status: "running", late_registration_open: true });
    expect(sortTournaments([soon, late]).map((t) => t.name)).toEqual(["late", "soon"]);
  });

  it("runs upcoming tournaments soonest first", () => {
    const thursday = make({ name: "thursday", scheduled_start_at: new Date(NOW + 48 * HOUR).toISOString() });
    const tonight = make({ name: "tonight", scheduled_start_at: new Date(NOW + 6 * HOUR).toISOString() });
    expect(sortTournaments([thursday, tonight]).map((t) => t.name)).toEqual(["tonight", "thursday"]);
  });

  it("runs finished tournaments newest first, which is the one you want", () => {
    const older = make({ name: "older", status: "finished", created_at: new Date(NOW - 96 * HOUR).toISOString() });
    const recent = make({ name: "recent", status: "finished", created_at: new Date(NOW - 2 * HOUR).toISOString() });
    expect(sortTournaments([older, recent]).map((t) => t.name)).toEqual(["recent", "older"]);
  });

  it("does not mutate what it was given", () => {
    const list = [make({ name: "a", status: "finished" }), make({ name: "b" })];
    sortTournaments(list);
    expect(list.map((t) => t.name)).toEqual(["a", "b"]);
  });
});

describe("filterTournaments", () => {
  const list = [
    make({ name: "open one" }),
    make({ name: "mine", is_joined: true, status: "running" }),
    make({ name: "late one", status: "running", late_registration_open: true }),
    make({ name: "done", status: "finished" }),
  ];

  it("shows everything under All, the past included", () => {
    // It used to hide the finished ones, which is not what the word says — and
    // it hid last night's result from anybody who had not found the Finished
    // chip. What keeps the past from burying the present is the order and the
    // separation, not the filter.
    expect(filterTournaments(list, "all").map((t) => t.name))
      .toEqual(["open one", "mine", "late one", "done"]);
  });

  it("shows only what each filter is for", () => {
    expect(filterTournaments(list, "late").map((t) => t.name)).toEqual(["late one"]);
    expect(filterTournaments(list, "mine").map((t) => t.name)).toEqual(["mine"]);
    expect(filterTournaments(list, "finished").map((t) => t.name)).toEqual(["done"]);
  });

  it("does not offer you a seat you already have under Open", () => {
    expect(filterTournaments(list, "open").map((t) => t.name)).toEqual(["open one"]);
  });

  it("searches the host as well as the name", () => {
    const games = [make({ name: "Friday", host_name: "ana" }), make({ name: "Sunday", host_name: "bea" })];
    expect(filterTournaments(games, "all", "bea").map((t) => t.name)).toEqual(["Sunday"]);
    expect(filterTournaments(games, "all", "FRI").map((t) => t.name)).toEqual(["Friday"]);
  });

  it("falls back to showing something when handed a filter it does not know", () => {
    expect(filterTournaments(list, "nonsense").length).toBe(4);
  });
});

describe("keeping the past out of the way", () => {
  it("never puts a finished night under the same heading as a live one", () => {
    // Both happened today: without the split they shared a day group, and the
    // thing you can still join sat next to the thing that is over.
    const groups = groupByDay([
      make({ name: "tonight", scheduled_start_at: new Date(NOW + HOUR).toISOString() }),
      make({ name: "this afternoon", status: "finished" }),
    ], NOW);

    expect(groups).toHaveLength(2);
    expect(groups[0].past).toBe(false);
    expect(groups[0].tournaments.map((t) => t.name)).toEqual(["tonight"]);
    expect(groups[1].past).toBe(true);
    expect(groups[1].tournaments.map((t) => t.name)).toEqual(["this afternoon"]);
  });

  it("puts every past group after every live one", () => {
    const groups = groupByDay([
      make({ name: "old", status: "finished", created_at: new Date(NOW - 48 * HOUR).toISOString() }),
      make({ name: "soon", scheduled_start_at: new Date(NOW + 48 * HOUR).toISOString() }),
      make({ name: "yesterday", status: "finished", created_at: new Date(NOW - 24 * HOUR).toISOString() }),
    ], NOW);

    expect(groups.map((one) => one.past)).toEqual([false, true, true]);
    // Newest first among the played ones: you want last night, not the first
    // night anybody ever played.
    expect(groups.slice(1).flatMap((one) => one.tournaments.map((t) => t.name)))
      .toEqual(["yesterday", "old"]);
  });
});

describe("dayLabel", () => {
  it("names the days close enough to have names", () => {
    expect(dayLabel(NOW, NOW)).toBe("Today");
    expect(dayLabel(NOW + 24 * HOUR, NOW)).toBe("Tomorrow");
    expect(dayLabel(NOW - 24 * HOUR, NOW)).toBe("Yesterday");
  });

  it("says so when there is no date at all", () => {
    expect(dayLabel(null, NOW)).toBe("No date set");
  });

  it("gives a real date for anything further out", () => {
    expect(dayLabel(NOW + 96 * HOUR, NOW)).not.toMatch(/Today|Tomorrow|Yesterday/);
  });
});

describe("groupByDay", () => {
  it("cuts the sorted list into days without reordering it", () => {
    const tonight = make({ name: "tonight", scheduled_start_at: new Date(NOW + 6 * HOUR).toISOString() });
    const tomorrow = make({ name: "tomorrow", scheduled_start_at: new Date(NOW + 30 * HOUR).toISOString() });
    const live = make({ name: "live", status: "running", is_joined: true,
      created_at: new Date(NOW - 30 * HOUR).toISOString() });

    const groups = groupByDay([tomorrow, tonight, live], NOW);

    // The game being played comes first even though it started yesterday:
    // grouping follows the order, it does not impose one.
    expect(groups.map((g) => g.tournaments.map((t) => t.name)))
      .toEqual([["live"], ["tonight"], ["tomorrow"]]);
    expect(groups.map((g) => g.label)).toEqual(["Yesterday", "Today", "Tomorrow"]);
  });

  it("keeps same-day tournaments in one group", () => {
    const early = make({ name: "early", scheduled_start_at: new Date(NOW + 2 * HOUR).toISOString() });
    const later = make({ name: "later", scheduled_start_at: new Date(NOW + 5 * HOUR).toISOString() });

    const groups = groupByDay([later, early], NOW);

    expect(groups).toHaveLength(1);
    expect(groups[0].tournaments.map((t) => t.name)).toEqual(["early", "later"]);
  });
});
