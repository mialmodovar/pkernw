import { describe, expect, it } from "vitest";

import { drawLabel, historyNet, myResult, myReturn, netLabel, winnerName } from "./spinGoHistory";

const won = { stake: 25, multiplier: 10, prize_coins: 250, i_won: true, my_finish: 1 };
const lost = { stake: 25, multiplier: 2, prize_coins: 50, i_won: false, my_finish: 3 };

describe("drawLabel", () => {
  it("says the draw and what it paid", () => {
    expect(drawLabel(won)).toBe("10× · 🪙 250");
  });
});

describe("winnerName", () => {
  it("prefers the nickname somebody chose", () => {
    expect(winnerName({ winner: { username: "ana", display_name: "Ana P" } })).toBe("Ana P");
    expect(winnerName({ winner: { username: "ana", display_name: "" } })).toBe("ana");
    expect(winnerName({})).toBe("—");
  });
});

describe("myResult", () => {
  it("says won rather than 1st", () => {
    expect(myResult(won)).toBe("won");
  });

  it("places the other two", () => {
    expect(myResult(lost)).toBe("3rd");
    expect(myResult({ ...lost, my_finish: 2 })).toBe("2nd");
  });

  it("says nothing about a game you were not in", () => {
    expect(myResult({ ...lost, my_finish: null, i_won: false })).toBe("");
  });
});

describe("myReturn", () => {
  it("is the prize when you won it and nothing when you did not", () => {
    expect(myReturn(won)).toBe(250);
    expect(myReturn(lost)).toBe(0);
  });
});

describe("historyNet", () => {
  it("nets the stakes against the prizes", () => {
    // 250 back on one 25 stake, then two more stakes gone.
    expect(historyNet([won, lost, lost])).toBe(175);
  });

  it("is a loss when nothing came back", () => {
    expect(historyNet([lost, lost])).toBe(-50);
  });

  it("is even with nothing played", () => {
    expect(historyNet()).toBe(0);
  });
});

describe("netLabel", () => {
  it("says the sign out loud", () => {
    expect(netLabel(175)).toBe("+175");
    expect(netLabel(-50)).toBe("−50");
    expect(netLabel(0)).toBe("even");
  });
});
