import { describe, it, expect } from "vitest";
import playerProfile, { PROFILE_MIN_HANDS, vpipTone } from "./playerProfile";

const read = (hands, vpip_pct, pfr_pct) => playerProfile({ hands, vpip_pct, pfr_pct });

describe("playerProfile", () => {
  it("says nothing until there is a sample worth reading", () => {
    expect(read(PROFILE_MIN_HANDS - 1, 60, 50)).toBeNull();
    expect(read(PROFILE_MIN_HANDS, 60, 50)).not.toBeNull();
    expect(playerProfile(null)).toBeNull();
  });

  it("separates tight players by how much of their entering is raising", () => {
    expect(read(50, 20, 16).label).toBe("TAG");
    expect(read(50, 20, 4).label).toBe("Rock");
  });

  it("names the loose ends of the range", () => {
    expect(read(50, 12, 8).label).toBe("Nit");
    expect(read(50, 40, 30).label).toBe("LAG");
    expect(read(50, 40, 8).label).toBe("Calling station");
    expect(read(50, 60, 45).label).toBe("Maniac");
  });

  it("carries a description for the hover", () => {
    expect(read(50, 20, 16).description).toMatch(/\w/);
  });
});

describe("vpipTone", () => {
  const tone = (hands, vpip_pct) => vpipTone({ hands, vpip_pct });

  it("runs cold for the players who wait and warm for the ones who do not", () => {
    expect(tone(50, 10).word).toBe("very tight");
    expect(tone(50, 22).word).toBe("solid");
    expect(tone(50, 33).word).toBe("loose");
    expect(tone(50, 55).word).toBe("very loose");
  });

  it("stays grey until the sample supports a read", () => {
    expect(tone(PROFILE_MIN_HANDS - 1, 55).color).toContain("text-muted");
    expect(tone(PROFILE_MIN_HANDS, 55).color).not.toContain("text-muted");
  });
});
