import { describe, expect, it } from "vitest";

import { envelopeRows, leftOnTheBoard, drawnFrom } from "./mysteryEnvelopes";

describe("envelopeRows", () => {
  it("lists them biggest first", () => {
    expect(envelopeRows([25, 400, 100], []).map((row) => row.amount))
      .toEqual([400, 100, 25]);
  });

  it("strikes off what has been drawn", () => {
    const rows = envelopeRows([25, 400, 100], [400]);

    expect(rows.map((row) => row.taken)).toEqual([true, false, false]);
  });

  it("strikes off one of a repeated amount rather than all of them", () => {
    // Three envelopes of twenty-five is an ordinary board, and one knockout
    // takes one of them.
    const rows = envelopeRows([25, 25, 25, 400], [25]);

    expect(rows.filter((row) => row.taken)).toHaveLength(1);
    expect(leftOnTheBoard(rows)).toBe(3);
  });

  it("keeps the order as the board empties", () => {
    // A list that reorders itself as prizes go is one nobody can read twice.
    const before = envelopeRows([25, 400, 100], []).map((row) => row.amount);
    const after = envelopeRows([25, 400, 100], [100]).map((row) => row.amount);

    expect(after).toEqual(before);
  });

  it("ignores a draw of something that was never on the board", () => {
    const rows = envelopeRows([25, 100], [999]);

    expect(leftOnTheBoard(rows)).toBe(2);
  });

  it("has nothing to say before the pool is cut", () => {
    expect(envelopeRows(null, null)).toEqual([]);
    expect(leftOnTheBoard(null)).toBe(0);
  });

  it("counts an emptied board as empty", () => {
    expect(leftOnTheBoard(envelopeRows([25, 100], [25, 100]))).toBe(0);
  });
});

describe("drawnFrom", () => {
  // On arrival there is no history to go on: a reload gets the two lists and
  // the difference between them is what has already gone.
  it("is the difference between what there was and what is left", () => {
    expect(drawnFrom([400, 100, 25], [100, 25])).toEqual([400]);
  });

  it("counts repeats one at a time", () => {
    // Three of the same amount with one drawn leaves two, not none.
    expect(drawnFrom([25, 25, 25], [25, 25])).toEqual([25]);
  });

  it("is nothing when nothing has been drawn", () => {
    expect(drawnFrom([400, 100], [400, 100])).toEqual([]);
  });

  it("is everything when the board is empty", () => {
    expect(drawnFrom([400, 100], [])).toEqual([400, 100]);
  });

  it("has nothing to say before the pool is cut", () => {
    expect(drawnFrom(null, null)).toEqual([]);
  });
});
