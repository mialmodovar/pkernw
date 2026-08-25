import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crashReport, crashes, forgetCrashes, noteCrash, watchForCrashes } from "./crashLog";

const fakeStorage = () => {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
};

describe("crashLog", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", fakeStorage());
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps what was thrown, so a reload can still show it", () => {
    noteCrash(new Error("cards is not iterable"), "table");

    const [entry] = crashes();
    expect(entry.message).toBe("cards is not iterable");
    expect(entry.where).toBe("table");
    expect(crashReport()).toMatch(/cards is not iterable/);
  });

  it("keeps only the last few", () => {
    for (let i = 0; i < 12; i += 1) noteCrash(new Error(`boom ${i}`), "render");

    const kept = crashes();
    expect(kept.length).toBeLessThanOrEqual(5);
    expect(kept.at(-1).message).toBe("boom 11");
  });

  it("survives being handed something that is not an error", () => {
    expect(() => noteCrash(undefined)).not.toThrow();
    expect(crashes()).toHaveLength(1);
  });

  // It runs on the way out of a failure. One that fails takes the report with
  // it, and the report is the whole point.
  it("survives storage refusing to write", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => {},
    });

    expect(() => noteCrash(new Error("boom"))).not.toThrow();
    expect(crashes()).toEqual([]);
  });

  it("forgets on request", () => {
    noteCrash(new Error("boom"));
    forgetCrashes();

    expect(crashes()).toEqual([]);
  });

  it("catches what never reaches a render — a promise nobody awaited", () => {
    const handlers = {};
    const target = {
      addEventListener: (name, fn) => { handlers[name] = fn; },
      removeEventListener: (name) => { delete handlers[name]; },
    };

    const stop = watchForCrashes(target);
    handlers.unhandledrejection({ reason: new Error("no answer from the peer") });

    expect(crashes()[0].where).toBe("promise");
    expect(crashes()[0].message).toBe("no answer from the peer");

    stop();
    expect(Object.keys(handlers)).toEqual([]);
  });
});
