import { describe, expect, it } from "vitest";

import {
  historyLine, ordinal, rowLead, rowMoney, rowTags, spanBetween,
} from "./tournamentRow";

// The row that prompted all of this: a running club PKO whose facts line came
// to 83 characters and lost its tail — "late reg 8:20", the only thing on it
// anybody had to act on — to a truncate.
const clubNight = {
  status: "lobby",
  player_count: 23,
  max_players: 100,
  players_per_table: 9,
  club_name: "Paga Porco",
  league_name: "Liga de Inverno",
  bounty_mode: "progressive",
  bounty_cents: 250,
  buy_in_cents: 1000,
  payout_structure: [{}, {}, {}],
  late_reg_level: 12,
};

describe("rowLead", () => {
  it("leads a finished tournament with where you came in it", () => {
    expect(rowLead({ status: "finished", my_finish_position: 7, player_count: 23 }))
      .toEqual({ value: "7th", note: "of 23", tone: "past" });
  });

  it("says a win in the tone a win gets", () => {
    const lead = rowLead({ status: "finished", my_finish_position: 1, player_count: 9 });
    expect(lead).toEqual({ value: "1st", note: "of 9", tone: "win" });
  });

  it("does not pretend you played one you only watched", () => {
    expect(rowLead({ status: "finished", player_count: 9 }))
      .toEqual({ value: "—", note: "played", tone: "past" });
  });

  it("counts how long a running one has been going", () => {
    expect(rowLead({ status: "running" }, { elapsed: "1h 42m" }))
      .toEqual({ value: "1h 42m", note: "in", tone: "live" });
    expect(rowLead({ status: "paused" }, { elapsed: "20m" }).tone).toBe("live");
  });

  it("still says something for a running one the server never stamped", () => {
    expect(rowLead({ status: "running" }, { elapsed: null }).value).toBe("live");
  });

  it("counts down to a start that is near", () => {
    expect(rowLead(
      { status: "lobby" },
      { startTime: "22:00", startsInSeconds: 2 * 60 * 60 + 5 * 60 },
    )).toEqual({ value: "2h 05m", note: "to go", tone: "soon" });
  });

  it("drops the preposition, because the rail already means 'when'", () => {
    // "in 2h 05m" in a 3.25rem rail spends a third of the width on a word that
    // the note underneath says better.
    expect(rowLead({ status: "lobby" }, { startsInSeconds: 45 * 60 }).value).toBe("45 min");
    expect(rowLead({ status: "lobby" }, { startsInSeconds: 45 * 60 }).value).not.toMatch(/^in /);
  });

  it("says an imminent start the way round that is English", () => {
    // "starting now" is not a duration, so "starting now / to go" is nonsense.
    expect(rowLead({ status: "lobby" }, { startsInSeconds: 8 }))
      .toEqual({ value: "now", note: "starting", tone: "soon" });
  });

  it("gives the clock time for anything more than half a day out", () => {
    expect(rowLead(
      { status: "lobby" },
      { startTime: "21:00", startsInSeconds: 3 * 24 * 60 * 60 },
    )).toEqual({ value: "21:00", note: null, tone: "plain" });
  });

  it("has a rail to draw even with nothing to put in it", () => {
    expect(rowLead({ status: "lobby" }, {})).toEqual({ value: "—", note: null, tone: "plain" });
    expect(rowLead(null).value).toBe("—");
    expect(rowLead(undefined, undefined).value).toBe("—");
  });

  it("never returns a value long enough to break the rail", () => {
    const cases = [
      rowLead(clubNight, { startTime: "22:00" }),
      rowLead({ ...clubNight, status: "running" }, { elapsed: "12h 30m" }),
      rowLead({ ...clubNight, status: "finished", my_finish_position: 113 }),
      rowLead(clubNight, { startsInSeconds: 11 * 60 * 60 + 59 * 60 }),
    ];
    // "11h 59m" is the longest thing the rail can be asked to hold.
    for (const lead of cases) expect(lead.value.length).toBeLessThanOrEqual(7);
  });
});

describe("rowTags", () => {
  it("puts the clock you can act on first", () => {
    const tags = rowTags(
      { ...clubNight, status: "running", late_registration_open: true },
      { lateRegSeconds: 500, full: true },
    );
    expect(tags[0]).toEqual({ key: "late", text: "late reg 8:20", tone: "urgent" });
  });

  it("orders the rest: full, then the format, then the league", () => {
    const tags = rowTags(clubNight, { lateRegSeconds: null, full: true });
    expect(tags.map((tag) => tag.key)).toEqual(["late", "full", "bounty", "league"]);
    expect(tags.map((tag) => tag.text))
      .toEqual(["late reg L12", "full", "PKO", "Liga de Inverno"]);
  });

  it("caps the strip, which is the whole point of it", () => {
    // The old row had no cap, which is how nine facts ended up in one line and
    // the ninth got cut off. A fact that cannot win a slot does not appear.
    const tags = rowTags(clubNight, { full: true, max: 2 });
    expect(tags).toHaveLength(2);
    expect(tags.map((tag) => tag.key)).toEqual(["late", "full"]);
  });

  it("cuts by priority, not by order of arrival", () => {
    // One slot goes to the deadline, not to the league it counts for.
    expect(rowTags(clubNight, { full: true, max: 1 })[0].key).toBe("late");
    expect(rowTags({ ...clubNight, late_reg_level: 0 }, { full: true, max: 1 })[0].key)
      .toBe("full");
  });

  it("defaults to four and never exceeds it", () => {
    expect(rowTags(clubNight, { full: true }).length).toBeLessThanOrEqual(4);
    expect(rowTags(clubNight, { full: true, max: 0 })).toEqual([]);
  });

  it("names a knockout night by its kind", () => {
    const kind = (mode) => rowTags({ bounty_mode: mode, bounty_cents: 250 }, {})[0]?.text;
    expect(kind("progressive")).toBe("PKO");
    expect(kind("mystery")).toBe("Mystery");
    expect(kind("fixed")).toBe("KO");
    expect(kind("none")).toBe(undefined);
  });

  it("does not call a night a knockout when the heads are worth nothing", () => {
    expect(rowTags({ bounty_mode: "progressive", bounty_cents: 0 }, {})).toEqual([]);
  });

  it("says nothing about getting into a night that is over", () => {
    const tags = rowTags(
      { ...clubNight, status: "finished", late_registration_open: true },
      { lateRegSeconds: 500, full: true },
    );
    expect(tags.map((tag) => tag.key)).toEqual(["bounty", "league"]);
  });

  it("has nothing to say about a row with nothing on it", () => {
    expect(rowTags({}, {})).toEqual([]);
    expect(rowTags(null)).toEqual([]);
  });
});

describe("rowMoney", () => {
  it("gives the stake and the pool in euros, structured rather than written", () => {
    expect(rowMoney({ buy_in_cents: 1000 }, 23)).toEqual({
      stake: { kind: "euros", amount: 1000 },
      pool: { kind: "euros", amount: 23000 },
      net: null,
    });
  });

  it("gives coins as coins, so the row can draw the glyph", () => {
    expect(rowMoney({ buy_in_coins: 50 }, 4)).toEqual({
      stake: { kind: "coins", amount: 50 },
      pool: { kind: "coins", amount: 200 },
      net: null,
    });
  });

  it("has no stake and no pool for a free game", () => {
    expect(rowMoney({}, 9)).toEqual({ stake: null, pool: null, net: null });
  });

  it("counts entries rather than seats, so a rebuy moves the pool", () => {
    // A re-entry is another buy-in. The row used to read the seat count and go
    // quiet about every buy-back after it.
    expect(rowMoney({ buy_in_cents: 1000, player_count: 9, entry_count: 12 }).pool)
      .toEqual({ kind: "euros", amount: 12000 });
  });

  it("never invents what you won, because the server does not send it", () => {
    // my_prize_cents / my_prize_coins are not on TournamentListSerializer. Until
    // they are, every caller has to draw the column without them.
    expect(rowMoney({ status: "finished", buy_in_cents: 1000, my_finish_position: 1 }, 9).net)
      .toBe(null);
  });

  it("survives a row that is barely a row", () => {
    expect(rowMoney(null, 0)).toEqual({ stake: null, pool: null, net: null });
  });
});

describe("historyLine", () => {
  it("is who won it and how long it took", () => {
    expect(historyLine({ winner_name: "Miguel" }, { elapsed: "1h 20m" }))
      .toEqual({ winner: "Miguel", duration: "1h 20m" });
  });

  it("says nothing rather than something empty", () => {
    expect(historyLine({}, {})).toEqual({ winner: null, duration: null });
    expect(historyLine({ winner_name: "" }, {})).toEqual({ winner: null, duration: null });
    expect(historyLine(null)).toEqual({ winner: null, duration: null });
  });
});

describe("ordinal", () => {
  it("takes the suffix off the last digit", () => {
    expect([1, 2, 3, 4, 9].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "9th"]);
  });

  it("makes the teens 'th', which is the only reason this is a function", () => {
    expect([11, 12, 13].map(ordinal)).toEqual(["11th", "12th", "13th"]);
    expect([111, 112, 113].map(ordinal)).toEqual(["111th", "112th", "113th"]);
  });

  it("keeps counting past the teens", () => {
    expect([21, 22, 23, 101, 102].map(ordinal))
      .toEqual(["21st", "22nd", "23rd", "101st", "102nd"]);
  });
});

describe("spanBetween", () => {
  const at = (iso) => new Date(iso).getTime();

  it("is minutes under the hour and hours and minutes over it", () => {
    expect(spanBetween(at("2026-08-15T20:00:00Z"), at("2026-08-15T20:42:00Z"))).toBe("42m");
    expect(spanBetween(at("2026-08-15T20:00:00Z"), at("2026-08-15T21:42:00Z"))).toBe("1h 42m");
  });

  it("drops a bare zero off the end of a round number of hours", () => {
    expect(spanBetween(at("2026-08-15T20:00:00Z"), at("2026-08-15T22:00:00Z"))).toBe("2h");
  });

  it("says so rather than '0m' for something that only just began", () => {
    expect(spanBetween(at("2026-08-15T20:00:00Z"), at("2026-08-15T20:00:20Z")))
      .toBe("just started");
  });

  it("has nothing to say without a beginning", () => {
    expect(spanBetween(null, at("2026-08-15T22:00:00Z"))).toBe(null);
    expect(spanBetween(undefined)).toBe(null);
  });

  it("does not turn an unparseable stamp into a number", () => {
    expect(spanBetween("not a date", at("2026-08-15T22:00:00Z"))).toBe("just started");
  });
});
