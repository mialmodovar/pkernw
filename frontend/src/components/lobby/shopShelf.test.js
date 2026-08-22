import { describe, expect, it } from "vitest";

import { HIT_BLURB, alreadyYours, describe as describeItem, leftToBuy, shelf } from "./shopShelf";
import { THROWABLES } from "../game/throwables";
import { HITS } from "../game/hitEffects";

const items = [
  { item: "crown", price: 400, owned: false },
  { item: "banana", price: 100, owned: true },
  { item: "tomato", price: 0, owned: true },
  { item: "water", price: 100, owned: false },
  { item: "pie", price: 150, owned: false },
];

describe("shelf", () => {
  it("is cheapest first, and alphabetical within a price", () => {
    expect(shelf(items).map((row) => row.item)).toEqual(["banana", "water", "pie", "crown"]);
  });

  it("leaves the free ones out, since nobody buys them", () => {
    expect(shelf(items).some((row) => row.price === 0)).toBe(false);
  });

  it("does not move a thing once you own it", () => {
    // A shelf that reshuffles itself is a shelf you have to learn twice.
    const owned = items.map((row) => ({ ...row, owned: true }));
    expect(shelf(owned).map((row) => row.item)).toEqual(shelf(items).map((row) => row.item));
  });

  it("survives a shop that has not loaded", () => {
    expect(shelf(undefined)).toEqual([]);
  });
});

describe("alreadyYours", () => {
  it("is the ones that cost nothing", () => {
    expect(alreadyYours(items).map((row) => row.item)).toEqual(["tomato"]);
  });
});

describe("describe", () => {
  it("says what it is, what it costs, and what it does to them", () => {
    const water = shelf(items).find((row) => row.item === "water");
    expect(describeItem(water, 500)).toEqual({
      label: "Bucket of water",
      blurb: "soaks their screen",
      price: 100,
      owned: false,
      affordable: true,
    });
  });

  it("knows when you cannot afford it", () => {
    const crown = shelf(items).find((row) => row.item === "crown");
    expect(describeItem(crown, 50).affordable).toBe(false);
    expect(describeItem(crown, null).affordable).toBe(false);
  });

  it("does not tell the cigar it splashes", () => {
    // It lands on nobody. Saying otherwise would be the shop filling a line
    // with something that is not true.
    const cigar = { item: "cigar", price: 250, owned: false, look: { label: "Cigar", smoke: "💨" } };
    expect(describeItem(cigar, 999).blurb).toBe("drifts across the table");
  });

  it("has nothing to say about nothing", () => {
    expect(describeItem(null, 100)).toBe(null);
  });
});

describe("the blurbs", () => {
  it("cover every kind of landing there is", () => {
    for (const kind of Object.keys(HITS)) {
      expect(HIT_BLURB[kind], kind).toBeTruthy();
    }
  });

  it("give every buyable thing something to say about itself", () => {
    const rows = THROWABLES.map((item) => ({
      item: item.id, price: 100, owned: false, look: item,
    }));
    for (const row of rows) {
      expect(describeItem(row, 100).blurb, row.item).toBeTruthy();
    }
  });
});

describe("leftToBuy", () => {
  it("counts what is still on the shelf for this player", () => {
    expect(leftToBuy(items)).toBe(3);
  });
});
