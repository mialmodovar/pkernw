import { describe, expect, it } from "vitest";

import { socketPath, socketUrl } from "./socketUrl";

describe("socketPath", () => {
  it("knows the two kinds of room a hand is dealt in", () => {
    expect(socketPath("tournament", 7)).toBe("/ws/tournament/7/");
    expect(socketPath("cash", 7)).toBe("/ws/cash/7/");
  });

  it("treats anything it has not heard of as a tournament, which is what it was", () => {
    expect(socketPath(undefined, 7)).toBe("/ws/tournament/7/");
  });
});

describe("socketUrl", () => {
  const base = { token: "abc", host: "example.test", secure: false };

  it("carries the token, because the socket is authenticated by it", () => {
    expect(socketUrl("cash", 3, base)).toBe("ws://example.test/ws/cash/3/?token=abc");
  });

  it("is wss where the page is https", () => {
    expect(socketUrl("cash", 3, { ...base, secure: true })).toMatch(/^wss:/);
  });

  it("asks to watch a tournament table from the rail", () => {
    expect(socketUrl("tournament", 3, { ...base, spectateTable: 2 }))
      .toBe("ws://example.test/ws/tournament/3/?token=abc&spectate=1&table=2");
  });

  it("has no rail of its own at a cash table, where watching is just no seat", () => {
    expect(socketUrl("cash", 3, { ...base, spectateTable: 2 }))
      .toBe("ws://example.test/ws/cash/3/?token=abc");
  });
});
