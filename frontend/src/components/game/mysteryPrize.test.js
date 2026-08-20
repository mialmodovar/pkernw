import { describe, expect, it } from "vitest";

import { relativeSize, revealHeadline, revealMs, revealTone } from "./mysteryPrize";

describe("relativeSize", () => {
  it("is one for an envelope worth exactly an ordinary one", () => {
    // 1000 drawn, four of 1000 left: an ordinary one is 1000.
    expect(relativeSize(1000, 4000, 4)).toBeCloseTo(1, 5);
  });

  it("is measured against what anybody else can still draw", () => {
    // Five times what is left on the board per envelope, which is the thing
    // worth reacting to — averaging itself back in would flatten it to 2.8.
    expect(relativeSize(5000, 4000, 4)).toBeCloseTo(5, 5);
  });

  it("survives the last envelope, which has nothing to be compared against", () => {
    expect(relativeSize(0, 0, 0)).toBe(1);
    expect(relativeSize(5000, 0, 0)).toBe(1);
  });
});

describe("revealTone", () => {
  const board = { pool_left_cents: 4000, envelopes_left: 4 };

  it("is quiet for an ordinary envelope", () => {
    expect(revealTone({ ...board, envelope_cents: 1000 })).toBe("plain");
  });

  it("notices a good one", () => {
    expect(revealTone({ ...board, envelope_cents: 1800 })).toBe("big");
  });

  it("makes a moment of a big one", () => {
    expect(revealTone({ ...board, envelope_cents: 9000 })).toBe("jackpot");
  });

  it("always makes a moment of the biggest left, however modest the pool", () => {
    expect(revealTone({ ...board, envelope_cents: 1000, is_top_prize: true })).toBe("jackpot");
  });

  it("says nothing loud about a bounty that was not drawn at all", () => {
    expect(revealTone(null)).toBe("plain");
  });
});

describe("revealMs", () => {
  it("gives the big ones longer to be looked at", () => {
    expect(revealMs("jackpot")).toBeGreaterThan(revealMs("big"));
    expect(revealMs("big")).toBeGreaterThan(revealMs("plain"));
    expect(revealMs("nonsense")).toBe(revealMs("plain"));
  });
});

describe("revealHeadline", () => {
  it("has words for each of them", () => {
    expect(revealHeadline("jackpot")).toBe("The big one");
    expect(revealHeadline("plain")).toBe("Mystery bounty");
    expect(revealHeadline(undefined)).toBe("Mystery bounty");
  });
});
