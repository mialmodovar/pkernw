import { describe, expect, it } from "vitest";

import { SIDE_PANELS, isPanel, toggleOpen } from "./sidePanels";

describe("SIDE_PANELS", () => {
  it("leads with what decides which game you open", () => {
    expect(SIDE_PANELS[0].key).toBe("missions");
  });

  it("has no coins panel, because the header has the number", () => {
    expect(SIDE_PANELS.map((one) => one.key)).not.toContain("coins");
  });

  it("names every panel exactly once", () => {
    const keys = SIDE_PANELS.map((one) => one.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("toggleOpen", () => {
  it("opens one", () => {
    expect(toggleOpen(null, "stats")).toBe("stats");
  });

  it("closes the one that is open when it is pressed again", () => {
    // On a phone the panel is most of the screen, so the way in has to be the
    // way out.
    expect(toggleOpen("stats", "stats")).toBe(null);
  });

  it("only ever has one open", () => {
    expect(toggleOpen("stats", "clubs")).toBe("clubs");
  });

  it("ignores a key that names nothing", () => {
    expect(toggleOpen("stats", "nonsense")).toBe("stats");
  });
});

describe("isPanel", () => {
  it("knows its own", () => {
    expect(isPanel("friends")).toBe(true);
    expect(isPanel("coins")).toBe(false);
    expect(isPanel(null)).toBe(false);
  });
});
