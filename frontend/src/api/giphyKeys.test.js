import { describe, expect, it } from "vitest";

import {
  COOLDOWN_MS, keysReady, newRotation, parseKeys, restKey, restingUntil, takeKey,
} from "./giphyKeys";

describe("parseKeys", () => {
  it("reads a comma-separated list", () => {
    expect(parseKeys("aaa,bbb,ccc")).toEqual(["aaa", "bbb", "ccc"]);
  });

  it("tolerates the spacing and stray commas a deploy panel collects", () => {
    expect(parseKeys(" aaa , bbb ,,")).toEqual(["aaa", "bbb"]);
  });

  it("takes several variables at once, keeping the first order", () => {
    // The list, plus the single key the app shipped with before there was one.
    expect(parseKeys("aaa,bbb", "ccc")).toEqual(["aaa", "bbb", "ccc"]);
  });

  it("never lists the same key twice", () => {
    // It would take two turns out of every rotation and run out twice as fast.
    expect(parseKeys("aaa,bbb", "aaa")).toEqual(["aaa", "bbb"]);
  });

  it("has nothing to say about nothing", () => {
    expect(parseKeys("", undefined)).toEqual([]);
  });
});

describe("takeKey", () => {
  it("goes round the keys in turn", () => {
    // Evenly, not first-until-empty: each key holds an hour's allowance of its
    // own and the point is to spend three of them, not one three times.
    let rotation = newRotation(["a", "b", "c"]);
    const used = [];
    for (let i = 0; i < 7; i += 1) {
      const turn = takeKey(rotation, 0);
      used.push(turn.key);
      rotation = turn.rotation;
    }

    expect(used).toEqual(["a", "b", "c", "a", "b", "c", "a"]);
  });

  it("skips a key that is resting", () => {
    const rotation = restKey(newRotation(["a", "b"]), "a", 0);

    expect(takeKey(rotation, 1000).key).toBe("b");
  });

  it("uses it again once its hour is up", () => {
    const rotation = restKey(newRotation(["a"]), "a", 0);

    expect(takeKey(rotation, COOLDOWN_MS - 1).key).toBe(null);
    expect(takeKey(rotation, COOLDOWN_MS + 1).key).toBe("a");
  });

  it("says so when every key is spent", () => {
    let rotation = newRotation(["a", "b"]);
    rotation = restKey(rotation, "a", 0);
    rotation = restKey(rotation, "b", 0);

    expect(takeKey(rotation, 5).key).toBe(null);
    expect(keysReady(rotation, 5)).toBe(0);
  });

  it("has nothing to give when there are no keys at all", () => {
    expect(takeKey(newRotation([]), 0).key).toBe(null);
  });
});

describe("newRotation", () => {
  it("can start anywhere in the list", () => {
    // Each browser starts somewhere of its own, or the first key takes the
    // first request from every page load in the house.
    expect(takeKey(newRotation(["a", "b", "c"], 2), 0).key).toBe("c");
  });

  it("wraps a start beyond the end rather than falling off it", () => {
    expect(takeKey(newRotation(["a", "b"], 5), 0).key).toBe("b");
    expect(takeKey(newRotation([], 3), 0).key).toBe(null);
  });
});

describe("restingUntil", () => {
  it("is when the first key comes back", () => {
    let rotation = restKey(newRotation(["a", "b"]), "a", 0);
    rotation = restKey(rotation, "b", 1000);

    expect(restingUntil(rotation, 5000)).toBe(COOLDOWN_MS);
  });

  it("ignores a cooldown that has already passed", () => {
    // Otherwise an hour-old entry reports a wait of nothing while the key that
    // is actually spent has fifty minutes left on it.
    let rotation = restKey(newRotation(["a", "b"]), "a", 0);
    rotation = restKey(rotation, "b", COOLDOWN_MS);

    expect(restingUntil(rotation, COOLDOWN_MS + 5)).toBe(2 * COOLDOWN_MS);
  });

  it("is nothing while every key is fine", () => {
    expect(restingUntil(newRotation(["a"]), 0)).toBe(null);
  });
});
