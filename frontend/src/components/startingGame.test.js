import { describe, expect, it } from "vitest";

import { alertText, isAtTable, tablePath, worthTelling } from "./startingGame";

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
