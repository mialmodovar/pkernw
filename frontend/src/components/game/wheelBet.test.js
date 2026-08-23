import { describe, expect, it } from "vitest";

import {
  LINE_PX, NOTCH_PX, nextAmount, notchChips, takeNotches, wheelTravel,
} from "./wheelBet";

describe("wheelTravel", () => {
  it("takes pixels as they come", () => {
    expect(wheelTravel({ deltaY: 120, deltaMode: 0 })).toBe(120);
  });

  it("turns lines into pixels, so a mouse and a trackpad agree", () => {
    expect(wheelTravel({ deltaY: 3, deltaMode: 1 })).toBe(3 * LINE_PX);
  });

  it("survives an event with nothing in it", () => {
    expect(wheelTravel()).toBe(0);
    expect(wheelTravel({})).toBe(0);
  });
});

describe("takeNotches", () => {
  it("is one step per notch of travel", () => {
    expect(takeNotches(NOTCH_PX)).toEqual({ notches: 1, rest: 0 });
    expect(takeNotches(-NOTCH_PX).notches).toBe(-1);
    expect(takeNotches(-NOTCH_PX).rest).toBe(0);
  });

  it("keeps the remainder, so a slow drag adds up instead of vanishing", () => {
    const first = takeNotches(NOTCH_PX * 0.6);
    expect(first.notches).toBe(0);
    const second = takeNotches(first.rest + NOTCH_PX * 0.6);
    expect(second.notches).toBe(1);
  });

  it("takes several steps out of one flick", () => {
    expect(takeNotches(NOTCH_PX * 3.5).notches).toBe(3);
  });
});

describe("notchChips", () => {
  it("is half a big blind, the smallest difference anybody means", () => {
    expect(notchChips(200, 400, 12000)).toBe(100);
  });

  it("rounds an odd blind to whole chips", () => {
    expect(notchChips(150)).toBe(75);
    expect(notchChips(25)).toBe(13);
  });

  it("still moves at a table whose blind is one chip", () => {
    expect(notchChips(1)).toBe(1);
  });

  it("crosses the range in about twenty turns when there is no blind yet", () => {
    expect(notchChips(0, 0, 2000)).toBe(100);
  });

  it("is never zero, or the wheel would do nothing at all", () => {
    expect(notchChips(0, 500, 500)).toBe(1);
  });
});

describe("nextAmount", () => {
  // Half of a 400 blind, at a table running 200/400.
  const bounds = { step: 200, min: 800, max: 12000 };

  it("goes up when the wheel goes up", () => {
    // A wheel scrolled up reports negative travel, so negative notches.
    expect(nextAmount(1000, -1, bounds)).toBe(1200);
  });

  it("goes down when the wheel goes down", () => {
    expect(nextAmount(1000, 1, bounds)).toBe(800);
  });

  it("lands exactly on all in rather than overshooting it", () => {
    expect(nextAmount(11800, -40, bounds)).toBe(12000);
  });

  it("never goes under the minimum raise", () => {
    expect(nextAmount(1000, 30, bounds)).toBe(800);
  });

  it("moves several steps for a flick", () => {
    expect(nextAmount(1000, -3, bounds)).toBe(1600);
  });
});
