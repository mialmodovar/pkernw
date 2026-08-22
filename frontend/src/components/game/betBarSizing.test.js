import { describe, expect, it } from "vitest";

import { BUTTON_SIZE, WIDEST_LABELS } from "./betBarSizing";

describe("what the betting buttons are measured against", () => {
  it("is the panel, not the window", () => {
    // The regression this guards: the panel has a definite width, so viewport
    // units grew the type and the padding on a large monitor while the buttons
    // stayed the same size, and the label was cut off. Measured at 2560px: a
    // button had 89px of room for 123px of "Raise 148,600".
    expect(BUTTON_SIZE).toContain("cqw");
    expect(BUTTON_SIZE).not.toMatch(/\d(vw|vh|vmin|vmax)\b/);
  });

  it("clamps at both ends, so a phone can still read it and a monitor cannot bloat it", () => {
    const clamps = BUTTON_SIZE.match(/clamp\([^)]*\)/g) || [];
    expect(clamps.length).toBe(3);
    for (const clamp of clamps) {
      const [floor, scale, ceiling] = clamp.slice(6, -1).split(",");
      expect(floor, clamp).toMatch(/rem$/);
      expect(scale, clamp).toMatch(/cqw$/);
      expect(ceiling, clamp).toMatch(/rem$/);
      expect(Number.parseFloat(ceiling), clamp).toBeGreaterThan(Number.parseFloat(floor));
    }
  });

  it("keeps the type readable at the bottom of its range", () => {
    const text = BUTTON_SIZE.match(/text-\[clamp\(([^,]+),/)[1];
    // Twelve pixels. Below that it is a control nobody can hit in eight
    // seconds with a clock running.
    expect(Number.parseFloat(text)).toBeGreaterThanOrEqual(0.75);
  });

  it("names the labels the fit was checked against", () => {
    expect(WIDEST_LABELS.every((one) => one.length >= 12)).toBe(true);
  });
});
