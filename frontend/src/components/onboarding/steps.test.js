import { describe, expect, it } from "vitest";

import { STEPS, canSkip, nextStep, progress, stepIndex, stepTitle } from "./steps";
import { MODES } from "./modes";

describe("the walk", () => {
  it("starts at the account and ends at what you can play", () => {
    expect(STEPS[0].key).toBe("account");
    expect(STEPS[STEPS.length - 1].key).toBe("modes");
  });

  it("goes forwards, one step at a time", () => {
    expect(nextStep("account")).toBe("recovery");
    expect(nextStep("recovery")).toBe("clubs");
    expect(nextStep("clubs")).toBe("watch");
    expect(nextStep("watch")).toBe("modes");
  });

  it("ends", () => {
    expect(nextStep("modes")).toBeNull();
  });

  it("says nothing about a step that does not exist", () => {
    expect(stepIndex("nonsense")).toBe(-1);
    expect(nextStep("nonsense")).toBeNull();
    expect(stepTitle("nonsense")).toBe("");
  });
});

describe("progress", () => {
  it("counts from one", () => {
    expect(progress("account")).toEqual({ current: 1, total: STEPS.length });
    expect(progress("modes")).toEqual({ current: STEPS.length, total: STEPS.length });
  });

  it("reads an unknown step as the beginning rather than as nowhere", () => {
    expect(progress("nonsense").current).toBe(1);
  });
});

describe("canSkip", () => {
  it("lets somebody past the sociable steps", () => {
    expect(canSkip("clubs")).toBe(true);
    expect(canSkip("watch")).toBe(true);
  });

  it("does not offer to skip making the account", () => {
    expect(canSkip("account")).toBe(false);
  });

  it("does not offer to skip past the code, which is shown once", () => {
    expect(canSkip("recovery")).toBe(false);
  });
});

describe("the modes", () => {
  it("introduces all three, each with a name and a pitch", () => {
    expect(MODES.map((mode) => mode.key)).toEqual(["tournaments", "spingo", "sitngo"]);
    for (const mode of MODES) {
      expect(mode.label.length).toBeGreaterThan(0);
      expect(mode.blurb.length).toBeGreaterThan(20);
      expect(mode.detail.length).toBeGreaterThan(0);
    }
  });
});
