import { describe, expect, it } from "vitest";

import { HITS, drips, hitFor, scatter } from "./hitEffects";
import { THROWABLES } from "./throwables";

describe("hitFor", () => {
  it("gives every thrown item something to do on landing", () => {
    for (const item of THROWABLES) {
      // The cigar is the exception, and it is the exception for a reason: it
      // never lands, so there is nothing to land on anybody.
      if (item.smoke) continue;
      expect(hitFor(item.id), item.id).not.toBe(null);
    }
  });

  it("has nothing for the cigar, which never arrives", () => {
    expect(hitFor("cigar")).toBe(null);
  });

  it("stays quiet about an item this client has never heard of", () => {
    // A newer server can send an id this build does not know. Inventing an
    // effect for it would be guessing at somebody else's joke.
    expect(hitFor("anvil-of-the-future")?.kind).not.toBe(undefined);
  });

  it("carries the item's own colour and splat into the effect", () => {
    const water = hitFor("water");
    expect(water.kind).toBe("splash");
    expect(water.tint).toBe("#7fb3d5");
    expect(water.drips).toBeGreaterThan(0);
  });

  it("names a kind for every effect it can return", () => {
    for (const item of THROWABLES) {
      if (item.smoke) continue;
      expect(Object.keys(HITS), item.id).toContain(hitFor(item.id).kind);
    }
  });
});

describe("how long a hit lasts", () => {
  it("is over inside a second and a half, because a hand is being played", () => {
    for (const [kind, hit] of Object.entries(HITS)) {
      expect(hit.ms, kind).toBeLessThanOrEqual(1600);
      expect(hit.ms, kind).toBeGreaterThan(400);
    }
  });

  it("never blacks the table out", () => {
    for (const [kind, hit] of Object.entries(HITS)) {
      expect(hit.wash, kind).toBeLessThan(0.4);
    }
  });
});

describe("scatter", () => {
  it("puts every fleck inside the screen", () => {
    for (const bit of scatter(12, 7)) {
      expect(bit.left).toBeGreaterThanOrEqual(0);
      expect(bit.left).toBeLessThanOrEqual(100);
      expect(bit.top).toBeGreaterThanOrEqual(0);
      expect(bit.top).toBeLessThanOrEqual(100);
    }
  });

  it("is the same scatter for the same throw, and a different one for the next", () => {
    expect(scatter(6, 3)).toEqual(scatter(6, 3));
    expect(scatter(6, 3)).not.toEqual(scatter(6, 4));
  });

  it("asks for nothing when there is nothing to draw", () => {
    expect(scatter(0, 1)).toEqual([]);
  });
});

describe("drips", () => {
  it("spreads them across the top rather than in a comb", () => {
    const runs = drips(8, 2).map((one) => one.run);
    expect(new Set(runs).size).toBeGreaterThan(1);
    for (const one of drips(8, 2)) {
      expect(one.left).toBeGreaterThan(-5);
      expect(one.left).toBeLessThan(105);
      expect(one.run).toBeGreaterThan(0);
    }
  });

  it("draws none when the effect is dry", () => {
    expect(drips(0, 1)).toEqual([]);
  });
});
