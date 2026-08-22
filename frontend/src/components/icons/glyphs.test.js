import { describe, expect, it } from "vitest";

import { GLYPHS, ICON_NAMES, VIEWBOX, glyph } from "./glyphs";

const KINDS = new Set(["line", "fill", "accent"]);

describe("the icon set", () => {
  it("replaces every emoji the chrome used to repeat", () => {
    // The list this set exists for: coins, the three game modes, the brand
    // mark, the podium, the mystery envelope and the sandbox.
    for (const name of [
      "coin", "trophy", "spin", "duel", "brand",
      "medal-1", "medal-2", "medal-3", "envelope", "tools",
    ]) {
      expect(ICON_NAMES).toContain(name);
    }
  });

  it("draws every glyph on the same grid", () => {
    expect(VIEWBOX).toBe("0 0 24 24");
  });

  it("gives every glyph something to draw and something to be called", () => {
    for (const name of ICON_NAMES) {
      const found = GLYPHS[name];
      expect(found.label, name).toBeTruthy();
      expect(found.paths.length, name).toBeGreaterThan(0);
      for (const path of found.paths) {
        expect(path.d, name).toMatch(/^M/);
        expect(KINDS.has(path.kind), `${name}: ${path.kind}`).toBe(true);
      }
    }
  });

  it("keeps every stroke inside the grid it is drawn on", () => {
    // Coordinates come from the path data itself. A number out of range is a
    // glyph that clips at small sizes, which is invisible in review and obvious
    // in production.
    for (const name of ICON_NAMES) {
      for (const path of GLYPHS[name].paths) {
        const numbers = (path.d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
        for (const value of numbers) {
          expect(Math.abs(value), `${name}: ${path.d}`).toBeLessThanOrEqual(24);
        }
      }
    }
  });

  it("tells the three places apart by how many pips are struck into them", () => {
    const pips = (name) => GLYPHS[name].paths.filter((path) => path.kind === "fill").length;
    expect(pips("medal-1")).toBe(1);
    expect(pips("medal-2")).toBe(2);
    expect(pips("medal-3")).toBe(3);
    expect(GLYPHS["medal-1"].label).toBe("First");
  });

  it("has eight spokes on the wheel", () => {
    const lines = GLYPHS.spin.paths.filter((p) => p.kind === "line");
    // The rim, and eight spokes off the hub.
    expect(lines).toHaveLength(9);
  });

  it("answers to a name it knows and nothing else", () => {
    expect(glyph("coin")).toBe(GLYPHS.coin);
    expect(glyph("nonesuch")).toBe(null);
  });
});
