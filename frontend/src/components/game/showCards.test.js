import { describe, it, expect } from "vitest";

import { resolvePending } from "./showCards";

const pick = { cards: "As,Kd", indices: [0] };

describe("resolvePending", () => {
  it("holds a pick made on the way to folding until the hand is over", () => {
    expect(resolvePending({
      stored: pick, hand: "As,Kd", betweenHands: false, canShow: true,
    })).toBe("wait");
  });

  it("sends it the moment the hand is over", () => {
    expect(resolvePending({
      stored: pick, hand: "As,Kd", betweenHands: true, canShow: true,
    })).toBe("send");
  });

  it("has nothing to do when nothing was picked", () => {
    expect(resolvePending({
      stored: null, hand: "As,Kd", betweenHands: true, canShow: true,
    })).toBe("stale");
  });

  it("drops a pick about a hand that has been dealt over", () => {
    expect(resolvePending({
      stored: pick, hand: "7h,2c", betweenHands: true, canShow: true,
    })).toBe("stale");
  });

  it("never sends what the hand it belonged to no longer allows", () => {
    // A showdown, a runout, or a card already shown this hand: the cards are
    // public and the pick has nothing left to reveal.
    expect(resolvePending({
      stored: pick, hand: "As,Kd", betweenHands: true, canShow: false,
    })).toBe("stale");
  });
});
