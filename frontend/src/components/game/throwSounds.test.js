import { describe, expect, it } from "vitest";

import { landingFor } from "./sounds";
import { THROWABLES } from "./throwables";

describe("what a thrown thing sounds like when it lands", () => {
  it("is written for everything that can be thrown", () => {
    // The cigar is the exception on purpose: it never lands, it just smokes.
    const missing = THROWABLES
      .filter((item) => !item.smoke && !landingFor(item.id))
      .map((item) => item.id);
    expect(missing).toEqual([]);
  });

  it("is not the same sound for a brick as for a rose", () => {
    expect(landingFor("brick")).not.toBe(landingFor("rose"));
  });

  it("falls back rather than throwing on an item from a newer client", () => {
    expect(landingFor("piano-from-a-future-shop")).toBeNull();
  });

  it("does not land a bucket of water like a rubber chicken", () => {
    expect(landingFor("water")).not.toBe(landingFor("duck"));
    expect(landingFor("anvil")).not.toBe(landingFor("confetti"));
  });
});
