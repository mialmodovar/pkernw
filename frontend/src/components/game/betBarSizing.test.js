import { describe, expect, it } from "vitest";

import {
  BUTTON_SIZE, PANEL_LEFT_BLOCK, PANEL_ROW, PANEL_WIDTH_FLOOR, TWO_COLUMN_REM,
  WIDEST_LABELS, buttonRoomPx, labelNeedsPx,
} from "./betBarSizing";

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

// The floor is written into a Tailwind class, because that is the only form
// Tailwind can see; read it back out rather than keeping a second copy of the
// number here that could stop agreeing with it.
const FLOOR_REM = Number.parseFloat(PANEL_WIDTH_FLOOR.match(/max\((\d+(?:\.\d+)?)rem/)[1]);
const worstFit = (panelPx, twoColumn) => {
  const room = buttonRoomPx(panelPx, { twoColumn });
  const need = Math.max(...WIDEST_LABELS.map((label) => labelNeedsPx(label, panelPx)));
  return room / need;
};

describe("how wide the panel has to be before its two halves sit side by side", () => {
  it("switches on the panel rather than on the window", () => {
    // The regression this guards, and it is the worst one in the file's
    // history: the switch was `lg:`, which is the window at 1024px, while the
    // panel's own placement cap made it 384px wide at exactly that window. So
    // the layout that costs 244px of the button row arrived at the one width
    // where there was nothing to pay it with.
    for (const classes of [PANEL_ROW, PANEL_LEFT_BLOCK]) {
      expect(classes, classes).toContain(`@[${TWO_COLUMN_REM}rem]/panel:`);
      expect(classes, classes).not.toMatch(/\b(sm|md|lg|xl):/);
    }
  });

  it("would not have fitted at the widths that rule switched at", () => {
    // 384px is the panel at a 1024px window and 512px at 1280px — a laptop.
    // "Call 12,400" is a modest label at a modest table and neither of them
    // can print it.
    for (const panelPx of [384, 512]) {
      expect(buttonRoomPx(panelPx, { twoColumn: true }))
        .toBeLessThan(labelNeedsPx("Call 12,400", panelPx));
    }
  });

  it("waits until three buttons can still print a six-figure raise", () => {
    const panelPx = TWO_COLUMN_REM * 16;
    const need = labelNeedsPx("Raise 148,600", panelPx);
    expect(buttonRoomPx(panelPx, { twoColumn: true })).toBeGreaterThan(need * 1.05);
    // And it is not set higher than it has to be: one notch narrower and the
    // same label stops clearing that margin, which is what makes 40rem the
    // answer rather than a round number somebody liked.
    const narrower = (TWO_COLUMN_REM - 4) * 16;
    expect(buttonRoomPx(narrower, { twoColumn: true }))
      .toBeLessThan(labelNeedsPx("Raise 148,600", narrower) * 1.05);
  });
});

describe("the panel's width floor", () => {
  it("holds every label the engine can send, in one column", () => {
    // This is the guarantee, and it belongs to the stacked layout: one column
    // hands the whole panel to three buttons, so 26rem is enough for a
    // seven-figure raise at the 12px floor the type clamps to. Everything from
    // a 768px tablet to a 1600px monitor now gets this layout, which is why it
    // is the one that has to be right.
    expect(worstFit(FLOOR_REM * 16, false)).toBeGreaterThan(1.05);
  });

  it("is what the floor is for — a notch under it and the labels are cut", () => {
    expect(worstFit((FLOOR_REM - 2) * 16, false)).toBeLessThan(1.05);
  });

  it("still gives way to the felt once there is room to spare", () => {
    // The floor is a floor, not the width: past 68rem of window, half the felt
    // less a seat is wider than 26rem and that is what the panel takes.
    expect(PANEL_WIDTH_FLOOR).toContain("calc(50%-8rem)");
  });
});
