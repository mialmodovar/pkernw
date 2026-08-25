import { describe, expect, it } from "vitest";

import { grantedFromDevices, toRestore } from "./rejoinMedia";

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

describe("grantedFromDevices", () => {
  // A browser fills in the label only for a device you have already allowed,
  // which is how Firefox and Safari can be asked a question they do not
  // implement an answer to.
  const allowed = [
    { kind: "videoinput", label: "FaceTime HD Camera" },
    { kind: "audioinput", label: "MacBook Pro Microphone" },
  ];
  const unasked = [
    { kind: "videoinput", label: "" },
    { kind: "audioinput", label: "" },
  ];

  it("reads a granted camera off its label", () => {
    expect(grantedFromDevices(allowed, { camera: true })).toBe(true);
  });

  it("reads an unasked camera off the missing one", () => {
    expect(grantedFromDevices(unasked, { camera: true })).toBe(false);
  });

  it("wants both when both were on", () => {
    const cameraOnly = [allowed[0], unasked[1]];
    expect(grantedFromDevices(allowed, { camera: true, mic: true })).toBe(true);
    expect(grantedFromDevices(cameraOnly, { camera: true, mic: true })).toBe(false);
    // And the camera alone is still restorable from the same list.
    expect(grantedFromDevices(cameraOnly, { camera: true })).toBe(true);
  });

  it("says no when there is nothing to restore or nothing to read", () => {
    expect(grantedFromDevices(allowed, {})).toBe(false);
    expect(grantedFromDevices([], { camera: true })).toBe(false);
    expect(grantedFromDevices(undefined, { camera: true })).toBe(false);
  });
});
