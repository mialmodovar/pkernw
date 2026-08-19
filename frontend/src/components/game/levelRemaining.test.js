import { describe, it, expect } from "vitest";

import { levelIsEnding, levelRemainingLabel } from "./useLevelCountdown";

describe("levelRemainingLabel", () => {
  it("counts down a timed level as a clock", () => {
    expect(levelRemainingLabel({ duration_minutes: 12 }, 95)).toBe("1:35");
  });

  it("shows the full length of a timed level before its clock has read", () => {
    expect(levelRemainingLabel({ duration_minutes: 12 }, null)).toBe("12:00");
  });

  it("says how many hands are left, not how many have gone", () => {
    expect(levelRemainingLabel({ duration_hands: 8, hands_in_level: 3 })).toBe("5 hands");
  });

  it("counts a level nobody has played into yet", () => {
    expect(levelRemainingLabel({ duration_hands: 8 })).toBe("8 hands");
  });

  it("names the last one rather than saying 1 hands", () => {
    expect(levelRemainingLabel({ duration_hands: 8, hands_in_level: 7 })).toBe("last hand");
  });

  it("says what happens next once the level is used up", () => {
    expect(levelRemainingLabel({ duration_hands: 8, hands_in_level: 8 })).toBe("blinds up next");
    // Never a negative count, however far past the mark the reading is.
    expect(levelRemainingLabel({ duration_hands: 8, hands_in_level: 11 })).toBe("blinds up next");
  });

  it("has nothing to say without a level", () => {
    expect(levelRemainingLabel(null, 30)).toBeNull();
    expect(levelRemainingLabel({}, null)).toBeNull();
  });
});

describe("levelIsEnding", () => {
  it("warns inside the last minute of a timed level", () => {
    expect(levelIsEnding({ duration_minutes: 12 }, 60)).toBe(true);
    expect(levelIsEnding({ duration_minutes: 12 }, 5)).toBe(true);
    expect(levelIsEnding({ duration_minutes: 12 }, 0)).toBe(true);
  });

  it("stays quiet earlier in the level", () => {
    expect(levelIsEnding({ duration_minutes: 12 }, 61)).toBe(false);
    expect(levelIsEnding({ duration_minutes: 12 }, 600)).toBe(false);
  });

  it("says nothing before the clock has read", () => {
    expect(levelIsEnding({ duration_minutes: 12 }, null)).toBe(false);
  });

  // A level counted in hands ends when the hand ends, so there is no last
  // minute to warn about — and no clock ticking down to misread as one.
  it("never warns on a level counted in hands", () => {
    expect(levelIsEnding({ duration_hands: 8, hands_in_level: 7 }, 3)).toBe(false);
  });

  it("copes with no level at all", () => {
    expect(levelIsEnding(null, 10)).toBe(false);
  });
});
