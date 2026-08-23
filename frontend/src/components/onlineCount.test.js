import { describe, expect, it } from "vitest";

import { POLL_MS, onlineLabel, onlineTitle, worthShowing } from "./onlineCount";

describe("onlineLabel", () => {
  it("is the number once there is one", () => {
    expect(onlineLabel(12)).toBe("12");
    expect(onlineLabel(0)).toBe("0");
  });

  it("is nothing at all until the first answer", () => {
    expect(onlineLabel(null)).toBe(null);
    expect(onlineLabel(undefined)).toBe(null);
  });
});

describe("onlineTitle", () => {
  it("counts players in the plural", () => {
    expect(onlineTitle(9)).toBe("9 players online");
  });

  it("does not tell the one person here that one player is online", () => {
    // The one player is them, and "1 player online" reads as lonely as well as
    // being strange from the inside.
    expect(onlineTitle(1)).toBe("Just you, for the moment");
  });

  it("says something sensible about an empty room and an unknown one", () => {
    expect(onlineTitle(0)).toBe("Nobody else is here right now");
    expect(onlineTitle(null)).toBe("Counting who is here");
  });
});

describe("worthShowing", () => {
  it("waits for the first answer rather than flashing a zero", () => {
    expect(worthShowing(null)).toBe(false);
    expect(worthShowing(0)).toBe(false);
    expect(worthShowing(3)).toBe(true);
  });
});

describe("how often it asks", () => {
  it("is lazy, because it is every client and nobody needs it to the second", () => {
    expect(POLL_MS).toBeGreaterThanOrEqual(15000);
  });
});
