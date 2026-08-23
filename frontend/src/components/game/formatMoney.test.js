import { describe, expect, it } from "vitest";

import { formatBounty, formatEuros } from "./formatMoney";

describe("formatEuros", () => {
  it("loses the pennies when there are none", () => {
    expect(formatEuros(1000)).toBe("€10");
  });

  it("keeps them when there are", () => {
    expect(formatEuros(250)).toBe("€2.50");
  });

  it("says nothing much about nothing", () => {
    expect(formatEuros(0)).toBe("€0");
  });
});


describe("formatBounty", () => {
  // The bug: All In or Fold puts the whole buy-in on a head, and the buy-in is
  // coins. A twenty-five coin head came out as €0.25.
  it("is coins at a game played for coins", () => {
    expect(formatBounty(25, { key: "allinfold", stake_coins: 25 })).toBe("25 coins");
  });

  it("is euros at a game played for euros", () => {
    expect(formatBounty(250, null)).toBe("€2.50");
  });

  it("treats a game with no coin stake as a euro game", () => {
    // A scheduled tournament has no `fast` payload at all, and one with a
    // zero coin stake is not a coin game either.
    expect(formatBounty(250, { key: "hu", stake_coins: 0 })).toBe("€2.50");
  });

  it("says nothing about a head worth nothing, in either money", () => {
    expect(formatBounty(0, { stake_coins: 25 })).toBe("0 coins");
    expect(formatBounty(0, null)).toBe("€0");
  });
});
