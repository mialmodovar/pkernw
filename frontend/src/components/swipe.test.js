import { describe, expect, it } from "vitest";

import { SWIPE_MIN_PX, clampPage, swipeStep } from "./swipe";

const drag = (dx, dy = 0) => swipeStep({ dx, dy });

describe("swipeStep", () => {
  it("turns forward when the finger goes left", () => {
    expect(drag(-120)).toBe(1);
  });

  it("turns back when the finger goes right", () => {
    expect(drag(120)).toBe(-1);
  });

  it("ignores a tap, and a thumb resting on the panel", () => {
    expect(drag(0)).toBe(0);
    expect(drag(SWIPE_MIN_PX - 1)).toBe(0);
  });

  // The one that matters: this lives on a tall scrolling sheet, and a drag down
  // it never travels perfectly straight. Turning the page because a scroll
  // wandered sideways would make the panel feel possessed.
  it("leaves a scroll alone, however crooked", () => {
    expect(drag(70, -400)).toBe(0);
    expect(drag(-70, 400)).toBe(0);
  });

  it("still turns on a long swipe that drifts a little", () => {
    expect(drag(-180, 40)).toBe(1);
  });
});

describe("clampPage", () => {
  it("stays inside the pages there are", () => {
    expect(clampPage(-1, 4)).toBe(0);
    expect(clampPage(9, 4)).toBe(3);
    expect(clampPage(2, 4)).toBe(2);
  });

  it("has an answer for no pages at all", () => {
    expect(clampPage(3, 0)).toBe(0);
  });
});
