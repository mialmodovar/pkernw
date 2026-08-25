import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The rotation as the picker actually meets it: two keys, and Giphy saying no.
 * The arithmetic is tested in giphyKeys.test.js; this is about the wiring —
 * that a spent key is followed by the next one rather than by an error, and
 * that the same question twice is one request.
 */

const load = async (keys) => {
  vi.resetModules();
  vi.stubEnv("VITE_GIPHY_API_KEYS", keys);
  vi.stubEnv("VITE_GIPHY_API_KEY", "");
  return import("./giphy");
};

const answer = (status, ids = []) => ({
  ok: status === 200,
  status,
  json: async () => ({ data: ids.map((id) => ({ id, title: id })) }),
});

const keyOf = (url) => new URL(url).searchParams.get("api_key");

let calls;

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// Which key a browser starts on is deliberately random — see giphy.js — so
// these assert which keys were used and how many times, never a fixed order.
const refuseFirst = () => vi.stubGlobal("fetch", vi.fn(async (url) => {
  calls.push(keyOf(url));
  return calls.length === 1 ? answer(429) : answer(200, ["gif1"]);
}));

describe("searching with several keys", () => {
  it("moves to another key when one is spent, and the search still works", async () => {
    refuseFirst();
    const { searchGifs } = await load("aaa,bbb");

    expect(await searchGifs("poker")).toEqual([{ id: "gif1", title: "gif1" }]);
    expect(calls).toHaveLength(2);
    expect(new Set(calls).size).toBe(2);
  });

  it("stops asking a key it has already been refused by", async () => {
    refuseFirst();
    const { searchGifs } = await load("aaa,bbb");

    await searchGifs("poker");
    await searchGifs("chips");

    // Four requests would mean the spent key was asked again for nothing.
    expect(calls).toHaveLength(3);
    expect(calls[2]).toBe(calls[1]);
  });

  it("says it is rate-limited, with a time, once every key is spent", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      calls.push(keyOf(url));
      return answer(429);
    }));
    const { searchGifs } = await load("aaa,bbb");

    await expect(searchGifs("poker")).rejects.toMatchObject({
      name: "GiphyRateLimited",
      retryAt: expect.any(Number),
    });
    expect(new Set(calls)).toEqual(new Set(["aaa", "bbb"]));

    // And nothing more is sent while they are resting: the picker is told to
    // wait, rather than the browser being told to keep asking.
    await expect(searchGifs("chips")).rejects.toMatchObject({ name: "GiphyRateLimited" });
    expect(calls).toHaveLength(2);
  });

  it("answers the same question from the cache", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      calls.push(keyOf(url));
      return answer(200, ["gif1"]);
    }));
    const { trendingGifs } = await load("aaa");

    await trendingGifs();
    await trendingGifs();

    // The picker opens on trending every single time somebody opens it.
    expect(calls).toEqual(["aaa"]);
  });

  it("asks nothing at all without a key, and does not pretend to be limited", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer(200, ["gif1"])));
    const { searchGifs, giphyConfigured } = await load("");

    expect(giphyConfigured).toBe(false);
    expect(await searchGifs("poker")).toEqual([]);
  });
});
