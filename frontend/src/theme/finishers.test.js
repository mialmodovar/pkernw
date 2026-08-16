import { describe, expect, it } from "vitest";

import { MAX_FINISHERS, normalizeFinishers, normalizeTheme } from "./themes";

describe("normalizeFinishers", () => {
  it("takes the list in either spelling the two sides use", () => {
    expect(normalizeFinishers({ finishers: [{ gif_id: "abc123", sound: "boom" }] }))
      .toEqual([{ gifId: "abc123", sound: "boom" }]);
    expect(normalizeFinishers({ finishers: [{ gifId: "abc123", sound: "boom" }] }))
      .toEqual([{ gifId: "abc123", sound: "boom" }]);
  });

  it("keeps the finisher of a profile saved before the list existed", () => {
    expect(normalizeFinishers({ finisher_gif_id: "old111" }))
      .toEqual([{ gifId: "old111", sound: "none" }]);
  });

  it("prefers the list once there is one", () => {
    expect(normalizeFinishers({ finisher_gif_id: "old111", finishers: [{ gifId: "new222" }] }))
      .toEqual([{ gifId: "new222", sound: "none" }]);
  });

  it("drops what is not an id and silences what is not a sound", () => {
    expect(normalizeFinishers({ finishers: [
      { gifId: "https://evil.example/x.gif" },
      { gifId: "fine11", sound: "kazoo" },
    ] })).toEqual([{ gifId: "fine11", sound: "none" }]);
  });

  it("caps the list and keeps each GIF once", () => {
    const many = normalizeFinishers({ finishers: [
      { gifId: "one" }, { gifId: "one" }, { gifId: "two" }, { gifId: "three" }, { gifId: "four" },
    ] });
    expect(many.map((one) => one.gifId)).toEqual(["one", "two", "three"]);
    expect(many.length).toBeLessThanOrEqual(MAX_FINISHERS);
  });

  it("is empty for somebody who has never chosen one", () => {
    expect(normalizeFinishers({})).toEqual([]);
    expect(normalizeFinishers(null)).toEqual([]);
  });
});

describe("normalizeTheme", () => {
  it("carries the finishers along with the colours", () => {
    const theme = normalizeTheme({ preset: "slate", finishers: [{ gifId: "abc123" }] });
    expect(theme.preset).toBe("slate");
    expect(theme.finishers).toEqual([{ gifId: "abc123", sound: "none" }]);
  });
});
