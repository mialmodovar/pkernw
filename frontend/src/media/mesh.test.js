import { describe, expect, it } from "vitest";
import {
  MAX_ICE_RESTARTS, OPEN_BUDGET, OPEN_WINDOW_MS, STABLE_MS, bitrateTier, desiredPeers, isPolite,
  mayOpenPeer, meshFailureMessage, shouldRestartIce,
} from "./mesh";

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

  // The crash this whole set exists to prevent. A busted player keeps their
  // seat, so leaving them out here left the two sides of the pair disagreeing
  // about whether they should be connected — one hanging up, the other
  // reconnecting, all evening. Whoever is on the roster is at this table.
  it("keeps a player who busted and stayed to watch", () => {
    const players = [player({ user_id: 2, is_eliminated: true })];

    expect(desiredPeers(players, [announced(2)], 1, 1).map((one) => one.userId))
      .toEqual([2]);
  });

  it("agrees with the busted player about who should be connected", () => {
    const players = [
      player({ user_id: 1 }),
      player({ user_id: 2, name: "bea", is_eliminated: true }),
    ];

    const mine = desiredPeers(players, [announced(2)], 1, 1).map((one) => one.userId);
    const theirs = desiredPeers(players, [announced(1)], 2, 1).map((one) => one.userId);

    expect(mine).toEqual([2]);
    expect(theirs).toEqual([1]);
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

  it("treats somebody who has busted as one of the rail", () => {
    const out = [{ user_id: 4, name: "Dee", table_number: 1, is_eliminated: true }];
    const roster = [{ user_id: 4, audio: true, video: true }];

    const wanted = desiredPeers([...seated, ...out], roster, 1, 1);

    expect(wanted.map((one) => one.userId)).toEqual([4]);
    expect(wanted[0].name).toBe("Dee");
  });

  it("leaves out somebody who busted and left, because the roster has", () => {
    const out = [{ user_id: 4, name: "Dee", table_number: 1, is_eliminated: true }];

    expect(desiredPeers([...seated, ...out], [], 1, 1)).toEqual([]);
  });

  it("still leaves out anybody who has not announced", () => {
    expect(desiredPeers(seated, [], 1, 1)).toEqual([]);
  });

  it("never includes me", () => {
    const roster = [{ user_id: 1, audio: true, video: true }];

    expect(desiredPeers(seated, roster, 1, 1)).toEqual([]);
  });
});

describe("shouldRestartIce", () => {
  it("tries again when a connection fails", () => {
    expect(shouldRestartIce({ restarts: 0, connectedFor: null }).restart).toBe(true);
  });

  it("gives up on a pair that keeps failing", () => {
    let restarts = 0;
    for (let attempt = 0; attempt < MAX_ICE_RESTARTS; attempt += 1) {
      const verdict = shouldRestartIce({ restarts, connectedFor: null });
      expect(verdict.restart).toBe(true);
      restarts = verdict.restarts;
    }

    expect(shouldRestartIce({ restarts, connectedFor: null }).restart).toBe(false);
  });

  // The loop that killed tabs: the pair really did connect every time, so a
  // count reset by `connected` alone never reached its limit.
  it("does not forgive a connection that died again straight away", () => {
    const verdict = shouldRestartIce({ restarts: MAX_ICE_RESTARTS, connectedFor: 900 });

    expect(verdict.restart).toBe(false);
  });

  it("forgives a connection that lasted", () => {
    const verdict = shouldRestartIce({ restarts: MAX_ICE_RESTARTS, connectedFor: STABLE_MS + 1 });

    expect(verdict.restart).toBe(true);
    expect(verdict.restarts).toBe(1);
  });
});

describe("mayOpenPeer", () => {
  const now = 1_700_000_000_000;

  it("lets a table open the connections it actually needs", () => {
    // A full table, twice over: everybody's cameras up, a rebalance, up again.
    const opened = Array.from({ length: 14 }, (_, i) => now - i * 1000);

    expect(mayOpenPeer(opened, now).allowed).toBe(true);
  });

  it("holds off a page opening them faster than any table needs", () => {
    const opened = Array.from({ length: OPEN_BUDGET }, (_, i) => now - i * 1000);

    expect(mayOpenPeer(opened, now).allowed).toBe(false);
  });

  // Temporary by construction: the burst falls out of the window and the table
  // reconnects on its own. A backstop that needs a reload to clear is a second
  // outage rather than a guard against the first.
  it("forgets a burst once it has passed", () => {
    const opened = Array.from({ length: OPEN_BUDGET }, (_, i) => now - i * 1000);
    const later = now + OPEN_WINDOW_MS + 1;

    const verdict = mayOpenPeer(opened, later);

    expect(verdict.allowed).toBe(true);
    expect(verdict.recent).toEqual([]);
  });

  it("hands back the window rather than a tally that only grows", () => {
    const opened = [now - OPEN_WINDOW_MS - 5, now - 10];

    expect(mayOpenPeer(opened, now).recent).toEqual([now - 10]);
  });
});
