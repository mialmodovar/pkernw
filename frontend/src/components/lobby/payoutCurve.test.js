import { describe, expect, it } from "vitest";

import {
  MAX_PAID_PLACES, bountyCentsFor, bountyPctOf, paidPct, payoutCurve, placesPaid,
} from "./payoutCurve";

describe("placesPaid", () => {
  it("is the share of the field, rounded to whole places", () => {
    expect(placesPaid(18, 20)).toBe(4);
    expect(placesPaid(9, 20)).toBe(2);
  });

  it("always pays somebody", () => {
    expect(placesPaid(3, 0)).toBe(1);
    expect(placesPaid(3, 5)).toBe(1);
  });

  it("never pays more places than there are players", () => {
    expect(placesPaid(4, 100)).toBe(4);
    expect(placesPaid(4, 150)).toBe(4);
  });

  it("survives a field nobody has set yet", () => {
    expect(placesPaid(0, 20)).toBe(1);
    expect(placesPaid(undefined, 20)).toBe(1);
  });
});

describe("paidPct", () => {
  it("reads back what a number of places is as a share", () => {
    expect(paidPct(18, 4)).toBe(22);
    expect(paidPct(9, 3)).toBe(33);
  });
});

describe("payoutCurve", () => {
  it("pays everything to the winner where one place pays", () => {
    expect(payoutCurve(1)).toEqual([{ place: 1, label: "1st", percentage: 100 }]);
  });

  it("always totals exactly a hundred, which is what the server insists on", () => {
    for (let places = 1; places <= MAX_PAID_PLACES; places += 1) {
      const total = payoutCurve(places).reduce((sum, row) => sum + row.percentage, 0);
      expect(total, `${places} places`).toBe(100);
    }
  });

  it("pays every place something, however deep the structure", () => {
    // The server refuses a zero share, and it is right to: a place paid
    // nothing is not a paid place. A deep tail is where that happens.
    for (let places = 1; places <= MAX_PAID_PLACES; places += 1) {
      const shares = payoutCurve(places).map((row) => row.percentage);
      expect(Math.min(...shares), `${places} places`).toBeGreaterThan(0);
    }
  });

  it("never asks for more places than whole percentages can pay", () => {
    expect(payoutCurve(500)).toHaveLength(MAX_PAID_PLACES);
    expect(placesPaid(500, 100)).toBe(MAX_PAID_PLACES);
  });

  it("never pays a lower place more than a higher one", () => {
    for (const places of [2, 5, 9, 20, 60]) {
      const shares = payoutCurve(places).map((row) => row.percentage);
      expect(shares, `${places} places`).toEqual([...shares].sort((a, b) => b - a));
    }
  });

  it("is steep at the top", () => {
    const [first, second] = payoutCurve(9);
    expect(first.percentage).toBeGreaterThan(second.percentage * 1.5);
  });

  it("names the places the way anybody would say them", () => {
    expect(payoutCurve(3).map((row) => row.label)).toEqual(["1st", "2nd", "3rd"]);
    expect(payoutCurve(12)[10].label).toBe("11th");
  });
});

describe("bountyCentsFor", () => {
  it("takes a share of the buy-in", () => {
    expect(bountyCentsFor(2000, 50)).toBe(1000);
    expect(bountyCentsFor(2500, 40)).toBe(1000);
  });

  it("never takes the whole buy-in, which would leave nothing to place for", () => {
    expect(bountyCentsFor(2000, 100)).toBe(1980);
    expect(bountyCentsFor(2000, 150)).toBe(1980);
  });

  it("is nothing when the buy-in is nothing", () => {
    expect(bountyCentsFor(0, 50)).toBe(0);
  });
});

describe("bountyPctOf", () => {
  it("reads an amount back as a share", () => {
    expect(bountyPctOf(2000, 1000)).toBe(50);
  });

  it("falls back to half for a tournament with no buy-in yet", () => {
    expect(bountyPctOf(0, 0)).toBe(50);
  });
});
