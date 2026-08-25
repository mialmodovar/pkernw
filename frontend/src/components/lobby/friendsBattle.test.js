import { describe, expect, it } from "vitest";

import { cellValue, headline, worthShowing } from "./friendsBattle";

const battle = (score, nights = 7) => ({ nights, score });

describe("headline", () => {
  it("puts you first when you are ahead", () => {
    expect(headline(battle({ mine: 3, theirs: 2, leader: "me" }), "Ana"))
      .toBe("You lead 3–2 over 7 nights together");
  });

  it("puts them first when they are, so the score reads their way round", () => {
    // The bug this exists to stop: "Ana leads 2–3".
    expect(headline(battle({ mine: 2, theirs: 3, leader: "them" }), "Ana"))
      .toBe("Ana leads 3–2 over 7 nights together");
  });

  it("says level rather than picking somebody", () => {
    expect(headline(battle({ mine: 2, theirs: 2, leader: "tie" }), "Ana"))
      .toBe("All square at 2–2 over 7 nights together");
  });

  it("counts one night as one night", () => {
    expect(headline(battle({ mine: 1, theirs: 0, leader: "me" }, 1), "Ana"))
      .toBe("You lead 1–0 over 1 night together");
  });

  it("has something to say to two friends who have never played together", () => {
    expect(headline(battle({ mine: 0, theirs: 0, leader: "tie" }, 0), "Ana"))
      .toBe("You have not played a night together yet.");
    expect(headline(null, "Ana")).toBe("You have not played a night together yet.");
  });
});

describe("cellValue", () => {
  it("prints a finish as a place", () => {
    expect(cellValue("best", 1)).toBe("1st");
    expect(cellValue("best", 3)).toBe("3rd");
    expect(cellValue("best", 11)).toBe("11th");
  });

  it("prints no finish as a dash rather than as zeroth", () => {
    expect(cellValue("best", 0)).toBe("—");
  });

  it("prints money in euros, from the cents the wire carries", () => {
    expect(cellValue("winnings", 2550)).toBe("25.50€");
    expect(cellValue("winnings", 0)).toBe("—");
  });

  it("prints a count as a count, zero included", () => {
    expect(cellValue("knockouts", 4)).toBe("4");
    expect(cellValue("rebuys", 0)).toBe("0");
  });
});

describe("worthShowing", () => {
  it("keeps a row somebody is on the board in", () => {
    expect(worthShowing({ mine: 0, theirs: 2 })).toBe(true);
  });

  it("drops a row that says nothing about either of you", () => {
    expect(worthShowing({ mine: 0, theirs: 0 })).toBe(false);
    expect(worthShowing(null)).toBe(false);
  });
});
