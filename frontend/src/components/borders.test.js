import { describe, expect, it } from "vitest";

import { BORDERS, borderFor, ringStyle } from "./borders";

describe("the set of rings", () => {
  it("is eight, which is what the shop sells", () => {
    expect(BORDERS).toHaveLength(8);
  });

  it("gives every one an id, a name and something to draw", () => {
    for (const border of BORDERS) {
      expect(border.id, border.id).toMatch(/^[a-z]+$/);
      expect(border.label, border.id).toBeTruthy();
      expect(border.ring, border.id).toContain("gradient");
      expect(border.glow, border.id).toContain("rgba");
    }
  });

  it("has no two the same, since the id is what a purchase is filed under", () => {
    const ids = BORDERS.map((one) => one.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("borderFor", () => {
  it("finds the ring somebody bought", () => {
    expect(borderFor("gold").label).toBe("Gold");
  });

  it("is the plain ring for nothing, and for an id this client has not heard of", () => {
    // A newer server can sell one this build cannot draw. Drawing the plain
    // one is better than guessing at somebody else's purchase.
    expect(borderFor("")).toBe(null);
    expect(borderFor(undefined)).toBe(null);
    expect(borderFor("platinum-from-a-future-shop")).toBe(null);
  });
});

describe("ringStyle", () => {
  it("is a padded gradient, because a border cannot be one", () => {
    const style = ringStyle("emerald", 3);
    expect(style.padding).toBe("3px");
    expect(style.background).toContain("gradient");
    expect(style.boxShadow).toContain("9px");
  });

  it("is nothing at all when there is no ring to draw", () => {
    expect(ringStyle("", 2)).toBe(null);
    expect(ringStyle("nonesuch", 2)).toBe(null);
  });
});
