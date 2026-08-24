import { describe, expect, it } from "vitest";

import { toRestore } from "./rejoinMedia";

const saved = { table: "t-7", cameraOn: true, micOn: false, at: 1000 };

describe("toRestore", () => {
  it("turns back on what was on, at the table it was on at", () => {
    expect(toRestore(saved, { table: "t-7", granted: true }))
      .toEqual({ audio: false, video: true });
  });

  it("restores nothing without the permission already granted", () => {
    // Asking on page load, for a reason nobody can see, is the surprise this
    // whole rule exists to avoid.
    expect(toRestore(saved, { table: "t-7", granted: false })).toBe(null);
  });

  it("does not carry a camera from one table to another", () => {
    expect(toRestore(saved, { table: "t-9", granted: true })).toBe(null);
  });

  it("has nothing to do for a session that never turned anything on", () => {
    expect(toRestore({ ...saved, cameraOn: false, micOn: false }, { table: "t-7", granted: true }))
      .toBe(null);
    expect(toRestore(null, { table: "t-7", granted: true })).toBe(null);
  });

  it("restores the microphone on its own", () => {
    expect(toRestore({ ...saved, cameraOn: false, micOn: true }, { table: "t-7", granted: true }))
      .toEqual({ audio: true, video: false });
  });
});
