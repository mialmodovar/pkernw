import { describe, expect, it } from "vitest";
import { bitrateTier, desiredPeers, isPolite } from "./mesh";

const player = (overrides) => ({
  user_id: 1, name: "ana", table_number: 1, is_eliminated: false, ...overrides,
});
const announced = (userId) => ({ user_id: userId, audio: true, video: true });

describe("desiredPeers", () => {
  it("wants the players at my table who have media on", () => {
    const players = [player({ user_id: 1 }), player({ user_id: 2, name: "bea" })];

    const peers = desiredPeers(players, [announced(2)], 1, 1);

    expect(peers.map((p) => p.userId)).toEqual([2]);
    expect(peers[0].name).toBe("bea");
  });

  it("never wants me", () => {
    const players = [player({ user_id: 1 })];

    expect(desiredPeers(players, [announced(1)], 1, 1)).toEqual([]);
  });

  it("drops players who have not turned anything on", () => {
    const players = [player({ user_id: 2 })];

    expect(desiredPeers(players, [], 1, 1)).toEqual([]);
  });

  it("drops players sitting at another table", () => {
    const players = [player({ user_id: 2, table_number: 2 })];

    expect(desiredPeers(players, [announced(2)], 1, 1)).toEqual([]);
  });

  it("drops players who busted out", () => {
    const players = [player({ user_id: 2, is_eliminated: true })];

    expect(desiredPeers(players, [announced(2)], 1, 1)).toEqual([]);
  });

  it("ignores players from before the id was in the payload", () => {
    const players = [player({ user_id: null })];

    expect(desiredPeers(players, [announced(2)], 1, 1)).toEqual([]);
  });
});

describe("isPolite", () => {
  it("makes exactly one side of a pair give way", () => {
    // If both peers agreed, a collision would deadlock or drop both offers.
    expect(isPolite(4, 9)).not.toBe(isPolite(9, 4));
  });
});

describe("bitrateTier", () => {
  it("asks for less as the table fills", () => {
    const rates = [1, 3, 5, 8].map((count) => bitrateTier(count).maxBitrate);

    expect(rates).toEqual([...rates].sort((a, b) => b - a));
    expect(new Set(rates).size).toBe(rates.length);
  });

  it("keeps a full table's upload within a home connection", () => {
    const peers = 8;
    const total = bitrateTier(peers).maxBitrate * peers;

    expect(total).toBeLessThan(800_000);
  });
});
