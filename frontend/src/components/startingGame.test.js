import { describe, expect, it } from "vitest";

import {
  alertAnswered, alertPath, alertText, isAtTable, readAlert, tablePath, worthTelling,
} from "./startingGame";

describe("worthTelling", () => {
  it("tells somebody reading the lobby", () => {
    expect(worthTelling({ pathname: "/", gameId: 7 })).toBe(true);
  });

  it("tells somebody at a different table, which is the whole point", () => {
    expect(worthTelling({ pathname: "/tournament/4/play", gameId: 7 })).toBe(true);
  });

  it("says nothing to somebody already at that table", () => {
    expect(worthTelling({ pathname: "/tournament/7/play", gameId: 7 })).toBe(false);
  });

  it("says nothing to somebody watching that table either", () => {
    expect(worthTelling({ pathname: "/tournament/7/watch/1", gameId: 7 })).toBe(false);
  });

  it("has nothing to say about a game with no id", () => {
    expect(worthTelling({ pathname: "/", gameId: undefined })).toBe(false);
    expect(worthTelling()).toBe(false);
  });
});

describe("isAtTable", () => {
  it("does not mistake table 71 for table 7", () => {
    expect(isAtTable("/tournament/71/play", 7)).toBe(false);
    expect(isAtTable("/tournament/7/play", 7)).toBe(true);
  });

  it("is not fooled by the setup page, which is not the felt", () => {
    expect(isAtTable("/tournament/7", 7)).toBe(false);
  });
});

describe("tablePath", () => {
  it("goes to the felt rather than the setup page", () => {
    expect(tablePath(7)).toBe("/tournament/7/play");
  });
});

describe("alertText", () => {
  it("names the format, because 'your game' names nothing when you hold three", () => {
    expect(alertText({ label: "Heads Up", prize_coins: 20 })).toEqual({
      title: "Heads Up is dealing",
      body: "\u{1FA99} 20 up · your seat is waiting",
    });
  });

  it("leads a Spin n Go with the multiplier, which was drawn seconds ago", () => {
    expect(alertText({ label: "Spin n Go", spin_multiplier: 100, prize_coins: 2500 })).toEqual({
      title: "Spin n Go is dealing",
      body: "100× drawn · \u{1FA99} 2,500 up · your seat is waiting",
    });
  });

  it("still says something about a game it knows nothing about", () => {
    expect(alertText(null)).toEqual({
      title: "Your game is dealing",
      body: "your seat is waiting",
    });
  });
});

describe("readAlert", () => {
  it("reads a queue that filled, a tournament that started, and one about to", () => {
    expect(readAlert({ type: "fast_game_started", game: { id: 7 } }))
      .toMatchObject({ kind: "started", refresh: "fast", tag: "fast_game_started-7" });
    expect(readAlert({ type: "tournament_started", game: { id: 9 } }))
      .toMatchObject({ kind: "started", refresh: "lobby" });
    expect(readAlert({ type: "tournament_starting", game: { id: 9 } }))
      .toMatchObject({ kind: "starting", refresh: "lobby" });
  });

  it("gives the two tournament messages different tags, since they are two", () => {
    const started = readAlert({ type: "tournament_started", game: { id: 9 } });
    const starting = readAlert({ type: "tournament_starting", game: { id: 9 } });
    expect(started.tag).not.toBe(starting.tag);
  });

  it("stays quiet about anything else on the socket", () => {
    expect(readAlert({ type: "chat_message", game: { id: 1 } })).toBe(null);
    expect(readAlert({ type: "tournament_started" })).toBe(null);
    expect(readAlert(undefined)).toBe(null);
  });
});

describe("alertText for a game that has not started yet", () => {
  it("says when rather than that it is dealing", () => {
    const { title, body } = alertText(
      { label: "Nine o'clock", starts_in_seconds: 300 }, "starting",
    );
    expect(title).toBe("Nine o'clock starts soon");
    expect(body).toContain("in about 5 min");
    expect(body).toContain("take your seat");
  });
});

describe("alertPath and alertAnswered", () => {
  it("sends a started game to the felt and a pending one to its own page", () => {
    expect(alertPath({ id: 4, kind: "started" })).toBe("/tournament/4/play");
    expect(alertPath({ id: 4, kind: "starting" })).toBe("/tournament/4");
  });

  it("counts arriving as the answer, wherever arriving means", () => {
    expect(alertAnswered("/tournament/4/play", { id: 4, kind: "started" })).toBe(true);
    expect(alertAnswered("/tournament/4", { id: 4, kind: "started" })).toBe(false);
    // Anywhere in the tournament answers a warning about it.
    expect(alertAnswered("/tournament/4", { id: 4, kind: "starting" })).toBe(true);
    expect(alertAnswered("/tournament/4/play", { id: 4, kind: "starting" })).toBe(true);
    expect(alertAnswered("/tournament/40", { id: 4, kind: "starting" })).toBe(false);
    expect(alertAnswered("/", { id: 4, kind: "starting" })).toBe(false);
  });
});
