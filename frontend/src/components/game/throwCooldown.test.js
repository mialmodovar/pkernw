import { describe, expect, it } from "vitest";

import { cooldownLabel, cooldownLeft, nextTickMs } from "./throwCooldown";

describe("cooldownLeft", () => {
  it("rounds up, so a wait never reads as nothing while it is still a wait", () => {
    expect(cooldownLeft(10_000, 9_100)).toBe(1);
    expect(cooldownLeft(10_000, 4_200)).toBe(6);
  });

  it("is nothing once the wait is over, or was never set", () => {
    expect(cooldownLeft(10_000, 10_000)).toBe(0);
    expect(cooldownLeft(10_000, 12_000)).toBe(0);
    expect(cooldownLeft(0, 500)).toBe(0);
    expect(cooldownLeft(undefined, 500)).toBe(0);
  });
});

describe("cooldownLabel", () => {
  it("counts down in seconds and says nothing when there is nothing to say", () => {
    expect(cooldownLabel(7)).toBe("7s");
    expect(cooldownLabel(0)).toBe(null);
  });
});

describe("nextTickMs", () => {
  it("lands on the next whole second rather than an arbitrary interval", () => {
    expect(nextTickMs(10_000, 4_200)).toBe(800);
    expect(nextTickMs(10_000, 4_000)).toBe(1000);
  });

  it("stops asking once the wait is over", () => {
    expect(nextTickMs(10_000, 10_000)).toBe(null);
    expect(nextTickMs(0, 1)).toBe(null);
  });
});
