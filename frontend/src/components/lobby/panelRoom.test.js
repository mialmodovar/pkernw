import { describe, expect, it } from "vitest";

import { roomBelow } from "./panelRoom";

describe("roomBelow", () => {
  it("leaves the panel everything below it bar the margin", () => {
    expect(roomBelow(100, 800, 12)).toBe(688);
  });

  it("keeps a phone's panel on the phone", () => {
    // iPhone 12, panel hanging off the table's top bar: the appearance panel is
    // some 900px tall, and this is what it has to fit in.
    const height = roomBelow(52, 844);

    expect(height).toBeLessThan(844);
    expect(height).toBeGreaterThan(700);
  });

  it("never shrinks to a slit, however low the panel starts", () => {
    expect(roomBelow(830, 844)).toBe(200);
    expect(roomBelow(2000, 844)).toBe(200);
  });

  it("says nothing when it has not been measured yet", () => {
    // Before the first layout there is no top to work from, and guessing one
    // would cap the panel at a height nothing measured.
    expect(roomBelow(null, 800)).toBe(null);
    expect(roomBelow(100, undefined)).toBe(null);
  });
});
