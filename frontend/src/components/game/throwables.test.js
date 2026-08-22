import { describe, expect, it } from "vitest";

import { THROWABLES, pickerOrder, throwableFor } from "./throwables";

describe("pickerOrder", () => {
  const owns = (id) => ["tomato", "egg", "crown"].includes(id);

  it("puts what you can throw right now first", () => {
    // At the table the question is what you can throw at them this second, and
    // the answer was scattered through seven rows of padlocked ones.
    expect(pickerOrder(owns).slice(0, 3).map((one) => one.id))
      .toEqual(["tomato", "egg", "crown"]);
  });

  it("keeps everything else, in the order the list is written", () => {
    expect(pickerOrder(owns)).toHaveLength(THROWABLES.length);
    const rest = pickerOrder(owns).slice(3).map((one) => one.id);
    const expected = THROWABLES.filter((one) => !owns(one.id)).map((one) => one.id);
    expect(rest).toEqual(expected);
  });

  it("is the plain list for somebody who owns nothing yet", () => {
    expect(pickerOrder(() => false).map((one) => one.id))
      .toEqual(THROWABLES.map((one) => one.id));
  });

  it("is the plain list again for somebody who owns everything", () => {
    expect(pickerOrder(() => true).map((one) => one.id))
      .toEqual(THROWABLES.map((one) => one.id));
  });
});

describe("throwableFor", () => {
  it("never returns nothing, because an id from a newer client still has to draw", () => {
    expect(throwableFor("harpsichord")).toBe(THROWABLES[0]);
    expect(throwableFor("crown").label).toBe("Crown");
  });
});
