import { describe, it, expect } from "vitest";

import { resolvePending, nextPending } from "./showCards";

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

describe("resolvePending, asked by the rest of the table", () => {
  // The bug this was written for: every seat runs the offer hook, and the ones
  // that are not yours hold no cards. Each of them saw a pick that did not
  // match the empty hand in front of it and threw it away as stale — so a card
  // picked on the way to folding was discarded the instant it was picked, and
  // nothing was ever shown.
  it("leaves somebody else's pick alone", () => {
    expect(resolvePending({
      stored: pick, hand: "", betweenHands: false, canShow: false, mine: false,
    })).toBe("idle");
  });

  it("leaves it alone once the hand is over, too", () => {
    // The moment it would otherwise have been sent — or, from a seat that is
    // not yours, dropped.
    expect(resolvePending({
      stored: pick, hand: "", betweenHands: true, canShow: false, mine: false,
    })).toBe("idle");
  });

  it("still lets the seat holding the cards decide", () => {
    expect(resolvePending({
      stored: pick, hand: "As,Kd", betweenHands: true, canShow: true, mine: true,
    })).toBe("send");
    expect(resolvePending({
      stored: pick, hand: "7h,2c", betweenHands: true, canShow: true, mine: true,
    })).toBe("stale");
  });
});

describe("nextPending", () => {
  // What makes one press enough: pressing a card asks for it, pressing it again
  // takes it back. Before this, a press only picked the card up and a second
  // press on a separate little button did the asking — which is the step
  // everybody missed, and the pick expired six seconds later anyway.
  it("asks for a card that was not asked for", () => {
    expect(nextPending([], 0)).toEqual([0]);
  });

  it("takes back one that was", () => {
    expect(nextPending([0], 0)).toEqual([]);
  });

  it("builds up to both", () => {
    expect(nextPending([1], 0)).toEqual([0, 1]);
  });

  it("leaves the other one alone when one is taken back", () => {
    expect(nextPending([0, 1], 0)).toEqual([1]);
  });

  it("treats nothing pending and nothing asked for as the same", () => {
    expect(nextPending(null, 1)).toEqual([1]);
  });
});
