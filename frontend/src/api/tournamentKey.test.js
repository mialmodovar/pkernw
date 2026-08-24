import { describe, expect, it } from "vitest";

import { canonicalPath, isNumericKey, tournamentPath } from "./tournamentKey";

describe("isNumericKey", () => {
  it("tells the number from the name", () => {
    expect(isNumericKey("42")).toBe(true);
    expect(isNumericKey("quinta-feira")).toBe(false);
    expect(isNumericKey("friday-2")).toBe(false);
    expect(isNumericKey("")).toBe(false);
    expect(isNumericKey(undefined)).toBe(false);
  });
});

describe("tournamentPath", () => {
  it("asks by number when it was given one", () => {
    expect(tournamentPath(42)).toBe("/tournaments/42/");
  });

  it("and by name when it was given one", () => {
    expect(tournamentPath("quinta-feira")).toBe("/tournaments/by-name/quinta-feira/");
  });
});

describe("canonicalPath", () => {
  it("corrects an address the tournament has moved away from", () => {
    // The old name is kept precisely so this link works; the bar is then put
    // right, so what gets copied next is the current one.
    expect(canonicalPath({ key: "friday", slug: "saturday" })).toBe("/tournament/saturday");
  });

  it("carries whatever followed it", () => {
    expect(canonicalPath({ key: "friday", slug: "saturday", tail: "/play" }))
      .toBe("/tournament/saturday/play");
    expect(canonicalPath({ key: "friday", slug: "saturday", tail: "/watch/2" }))
      .toBe("/tournament/saturday/watch/2");
  });

  it("leaves somebody who opened the number where they are", () => {
    // They may well have typed it, and moving them would be a surprise.
    expect(canonicalPath({ key: "42", slug: "friday" })).toBe(null);
  });

  it("does nothing when the address is already right", () => {
    expect(canonicalPath({ key: "friday", slug: "friday" })).toBe(null);
  });

  it("does nothing before the tournament has been read", () => {
    expect(canonicalPath({ key: "friday", slug: null })).toBe(null);
    expect(canonicalPath({ key: "friday", slug: "" })).toBe(null);
  });
});
