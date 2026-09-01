import { describe, expect, it } from "vitest";

import { GLYPHS, ICON_NAMES } from "../icons/glyphs";
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

  it("gives every panel a word short enough to print under its icon", () => {
    // Six buttons across a 390px phone, page padding px-4 and gap-1.5: about
    // 53px of content each. At text-[10px] that is nine characters with room
    // to spare, which is why the strip stacks the label instead of dropping it.
    for (const one of SIDE_PANELS) {
      expect(one.label, one.key).toBeTruthy();
      expect(one.label.length, one.key).toBeLessThanOrEqual(9);
      // Sentence case. Uppercase at tracking-wide is wider and says nothing
      // extra, and the widest label is the one that decides the layout.
      expect(one.label, one.key).not.toBe(one.label.toUpperCase());
    }
  });

  it("points every panel at a glyph drawn for it", () => {
    for (const one of SIDE_PANELS) {
      if (!one.icon) continue;
      expect(ICON_NAMES, one.key).toContain(one.icon);
    }

    // The two that used to borrow. `check` is a bare tick the glyph set itself
    // calls "Yes" — the opposite of "there is money here you have not
    // collected" — and `eye` is "Watching", a table you are spectating, which
    // is not a person. Both still exist for their own callers; neither may be
    // a panel's picture again.
    const icons = Object.fromEntries(SIDE_PANELS.map((one) => [one.key, one.icon]));
    expect(icons.missions).toBe("missions");
    expect(icons.friends).toBe("friends");
    expect(Object.values(icons)).not.toContain("check");
    expect(Object.values(icons)).not.toContain("eye");
    expect(GLYPHS[icons.missions].label).toBe("Missions");
    expect(GLYPHS[icons.friends].label).toBe("Friends");
  });

  it("gives each panel its own picture", () => {
    // The strip is six icons in a row; two of them the same is six icons that
    // teach nothing.
    const icons = SIDE_PANELS.map((one) => one.icon).filter(Boolean);
    expect(new Set(icons).size).toBe(icons.length);
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
