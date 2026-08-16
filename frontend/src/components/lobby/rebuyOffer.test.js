import { describe, expect, it } from "vitest";

import { rebuyLabel, rebuyOffer } from "./rebuyOffer";

const running = {
  status: "running",
  allow_rebuys: true,
  rebuys_open: true,
  max_rebuys: null,
  starting_chips: 10000,
};

const out = { eliminated: true, rebuysUsed: 0 };

describe("rebuyOffer", () => {
  it("offers a busted player their way back in", () => {
    expect(rebuyOffer(running, out)).toEqual({ chips: 10000, left: Infinity, capped: false });
  });

  it("says nothing to a player who is still in", () => {
    expect(rebuyOffer(running, { eliminated: false })).toBeNull();
  });

  it("holds off once the engine says the period has closed", () => {
    expect(rebuyOffer({ ...running, rebuys_open: false }, out)).toBeNull();
  });

  it("counts a capped tournament down and stops at nothing left", () => {
    const capped = { ...running, max_rebuys: 2 };
    expect(rebuyOffer(capped, { eliminated: true, rebuysUsed: 1 })).toMatchObject({ left: 1 });
    expect(rebuyOffer(capped, { eliminated: true, rebuysUsed: 2 })).toBeNull();
  });

  it("stays quiet where a rebuy could not land", () => {
    expect(rebuyOffer({ ...running, allow_rebuys: false }, out)).toBeNull();
    expect(rebuyOffer({ ...running, status: "finished" }, out)).toBeNull();
    expect(rebuyOffer({ ...running, status: "lobby" }, out)).toBeNull();
    expect(rebuyOffer(null, out)).toBeNull();
  });

  it("offers anyway when the payload predates the field, and lets the server refuse", () => {
    const { rebuys_open: _omitted, ...older } = running;
    expect(rebuyOffer(older, out)).toMatchObject({ chips: 10000 });
  });
});

describe("rebuyLabel", () => {
  it("names the stack, and the count only when there is one", () => {
    expect(rebuyLabel(rebuyOffer(running, out))).toBe("Rebuy — 10,000 chips");
    expect(rebuyLabel(rebuyOffer({ ...running, max_rebuys: 3 }, out)))
      .toBe("Rebuy — 10,000 chips (3 left)");
  });
});
