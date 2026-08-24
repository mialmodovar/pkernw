import { describe, expect, it } from "vitest";
import { bitrateTier, desiredPeers, isPolite, meshFailureMessage } from "./mesh";

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

  it("ignores a seat with no id on it, from before the payload had one", () => {
    // It cannot be matched to anything, so it decides nothing either way. The
    // peer in the roster is still a peer: the server only puts people who are
    // at this table into it, which is what makes somebody with no seat here a
    // spectator rather than a stranger.
    const players = [player({ user_id: null })];

    expect(desiredPeers(players, [announced(2)], 1, 1).map((one) => one.userId))
      .toEqual([2]);
    expect(desiredPeers(players, [], 1, 1)).toEqual([]);
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

describe("meshFailureMessage", () => {
  // The report this was written for: one player on mobile data saw nobody and
  // nobody saw him, while the other five saw everybody. Not five accidents —
  // one network that cannot be reached directly, and no relay to fall back to.
  it("says a whole table of failures is one thing", () => {
    const message = meshFailureMessage({
      peerCount: 5, failedCount: 5, relay: false, cameraOn: true,
    });
    expect(message).toMatch(/needs a relay/);
    expect(message).toMatch(/game itself is unaffected/);
  });

  it("stops blaming the network when there is a relay to blame instead", () => {
    const message = meshFailureMessage({
      peerCount: 5, failedCount: 5, relay: true, cameraOn: true,
    });
    expect(message).toMatch(/blocking video/);
    expect(message).not.toMatch(/none set up/);
  });

  it("says nothing while anybody at all is connected", () => {
    expect(meshFailureMessage({
      peerCount: 5, failedCount: 4, relay: false, cameraOn: true,
    })).toBe("");
  });

  it("says nothing to somebody who has their camera off", () => {
    expect(meshFailureMessage({
      peerCount: 5, failedCount: 5, relay: false, cameraOn: false,
    })).toBe("");
  });

  it("says nothing at a table with nobody else on it", () => {
    expect(meshFailureMessage({
      peerCount: 0, failedCount: 0, relay: false, cameraOn: true,
    })).toBe("");
  });

  it("is about one camera when there is only one", () => {
    expect(meshFailureMessage({
      peerCount: 1, failedCount: 1, relay: true, cameraOn: true,
    })).toBe("Could not connect to that camera.");
  });
});

describe("desiredPeers, with somebody on the rail", () => {
  // Watching a table meant seeing nobody and being seen by nobody: the mesh was
  // read off the seating plan, and a spectator has no seat.
  const seated = [
    { user_id: 1, name: "Ana", table_number: 1 },
    { user_id: 2, name: "Bea", table_number: 1 },
  ];

  it("connects a seated player to a watcher who has announced", () => {
    const roster = [
      { user_id: 2, audio: false, video: true },
      { user_id: 9, name: "Rail", audio: false, video: true, watching: true },
    ];

    const wanted = desiredPeers(seated, roster, 1, 1);

    expect(wanted.map((one) => one.userId)).toEqual([2, 9]);
    expect(wanted.find((one) => one.userId === 9).name).toBe("Rail");
  });

  it("connects the watcher to the table", () => {
    // From the rail: no seat of my own, and every seated announcer is a peer.
    const roster = [{ user_id: 1, audio: true, video: true }];

    expect(desiredPeers(seated, roster, 9, 1).map((one) => one.userId)).toEqual([1]);
  });

  it("still leaves out a seated player at another table", () => {
    const elsewhere = [{ user_id: 3, name: "Cec", table_number: 2 }];
    const roster = [{ user_id: 3, audio: true, video: true }];

    expect(desiredPeers([...seated, ...elsewhere], roster, 1, 1)).toEqual([]);
  });

  it("still leaves out somebody who has busted", () => {
    const out = [{ user_id: 4, name: "Dee", table_number: 1, is_eliminated: true }];
    const roster = [{ user_id: 4, audio: true, video: true }];

    expect(desiredPeers([...seated, ...out], roster, 1, 1)).toEqual([]);
  });

  it("still leaves out anybody who has not announced", () => {
    expect(desiredPeers(seated, [], 1, 1)).toEqual([]);
  });

  it("never includes me", () => {
    const roster = [{ user_id: 1, audio: true, video: true }];

    expect(desiredPeers(seated, roster, 1, 1)).toEqual([]);
  });
});
