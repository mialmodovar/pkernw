import { describe, it, expect } from "vitest";

import {
  SPEEDS,
  buildBlindStructure,
  formatDuration,
  niceBlind,
  structureMinutes,
} from "./blindStructureBuilder";

describe("niceBlind", () => {
  it("rounds to blinds people actually count out", () => {
    expect(niceBlind(96)).toBe(100);
    expect(niceBlind(2400)).toBe(2500);
    expect(niceBlind(730)).toBe(800);
  });

  it("never returns a big blind a small blind cannot halve", () => {
    for (const value of [11, 37, 149, 1234, 98765]) {
      expect(niceBlind(value) % 2).toBe(0);
    }
  });

  it("has a floor, so a tiny stack does not produce half-chip blinds", () => {
    expect(niceBlind(1)).toBeGreaterThanOrEqual(10);
    expect(niceBlind(0)).toBeGreaterThanOrEqual(10);
    expect(niceBlind(-5)).toBeGreaterThanOrEqual(10);
  });
});

describe("buildBlindStructure", () => {
  it("runs for about as long as it was asked to", () => {
    const levels = buildBlindStructure({ minutes: 120, speed: "normal" });
    expect(structureMinutes(levels)).toBe(120);
  });

  it("gets there in more, shorter levels the faster it is", () => {
    const normal = buildBlindStructure({ minutes: 120, speed: "normal" });
    const hyper = buildBlindStructure({ minutes: 120, speed: "hyper" });

    expect(hyper.length).toBeGreaterThan(normal.length);
    expect(hyper[0].duration_minutes).toBe(SPEEDS.hyper.minutesPerLevel);
    expect(structureMinutes(hyper)).toBe(120);
  });

  it("starts at a hundred big blinds, which is what a full stack means", () => {
    const levels = buildBlindStructure({ startingChips: 10000 });
    expect(levels[0].big_blind).toBe(100);
  });

  it("climbs, and never stalls on a repeated level", () => {
    const levels = buildBlindStructure({ minutes: 240, speed: "hyper" });
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i].big_blind).toBeGreaterThan(levels[i - 1].big_blind);
    }
  });

  it("ends with blinds big enough to actually end it", () => {
    const levels = buildBlindStructure({ minutes: 180, startingChips: 10000, players: 9 });
    const chipsInPlay = 10000 * 9;
    const finalBig = levels[levels.length - 1].big_blind;
    // The average stack is worth a handful of big blinds by the last level.
    expect(chipsInPlay / finalBig).toBeLessThan(20);
  });

  it("scales with the chips in play rather than assuming a stack size", () => {
    const small = buildBlindStructure({ startingChips: 5000 });
    const big = buildBlindStructure({ startingChips: 50000 });
    expect(big[0].big_blind).toBeGreaterThan(small[0].big_blind);
  });

  it("gives every level a small blind that is half the big one", () => {
    for (const level of buildBlindStructure({ minutes: 90, speed: "turbo" })) {
      expect(level.small_blind).toBe(level.big_blind / 2);
    }
  });

  it("leaves the opening level free of antes", () => {
    const levels = buildBlindStructure({});
    expect(levels[0].ante).toBe(0);
    expect(levels[1].ante).toBeGreaterThan(0);
  });

  it("is a structure rather than a ramp, however short the ask", () => {
    expect(buildBlindStructure({ minutes: 5, speed: "normal" }).length).toBeGreaterThanOrEqual(4);
  });

  it("builds something sane from nothing at all", () => {
    const levels = buildBlindStructure();
    expect(levels.length).toBeGreaterThan(0);
    expect(levels.every((l) => l.big_blind > 0 && l.duration_minutes > 0)).toBe(true);
  });
});

describe("formatDuration", () => {
  it("says it the way a host would", () => {
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(150)).toBe("2h 30m");
    expect(formatDuration(0)).toBe("—");
  });
});
