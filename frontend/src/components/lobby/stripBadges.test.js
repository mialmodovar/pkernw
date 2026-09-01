import { describe, expect, it } from "vitest";

import { friendAsks, missionsWaiting } from "./stripBadges";

describe("missionsWaiting", () => {
  it("counts only what can be collected", () => {
    // Done-and-claimed is not money waiting, and neither is a bar half full.
    const missions = [
      { key: "a", claimable: true },
      { key: "b", claimable: false, claimed: true },
      { key: "c", claimable: false },
      { key: "d", claimable: true },
    ];
    expect(missionsWaiting(missions)).toBe(2);
  });

  it("says nothing before the board has arrived", () => {
    // The strip asks for this on the first render, so it is asked once with
    // nothing in the store. A badge that flashes zero is a badge that lies.
    expect(missionsWaiting([])).toBe(0);
    expect(missionsWaiting(null)).toBe(0);
    expect(missionsWaiting(undefined)).toBe(0);
  });
});

describe("friendAsks", () => {
  it("counts the people, not the inbox", () => {
    // The bell carries game invitations too. Those are answered somewhere else
    // entirely, so they must not put a dot on Friends.
    const items = [
      { id: "friend_request:1", kind: "friend_request" },
      { id: "tournament_invite:7", kind: "tournament_invite" },
      { id: "friend_request:2", kind: "friend_request" },
      { id: "whatever:3", kind: "something_later" },
    ];
    expect(friendAsks(items)).toBe(2);
  });

  it("is zero for an inbox with nothing of ours in it", () => {
    expect(friendAsks([{ id: "tournament_invite:7", kind: "tournament_invite" }])).toBe(0);
  });

  it("survives an inbox that has not loaded", () => {
    expect(friendAsks([])).toBe(0);
    expect(friendAsks(null)).toBe(0);
    expect(friendAsks(undefined)).toBe(0);
  });

  it("does not trip over an item with no kind at all", () => {
    // The presence socket writes into the same list, and a malformed message
    // must not take the lobby down with it.
    expect(friendAsks([{ id: "x" }, { id: "y", kind: null }])).toBe(0);
  });
});
