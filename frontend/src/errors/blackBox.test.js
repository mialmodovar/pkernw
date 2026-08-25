import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  blackBoxReport, crashSamples, crashSummary, endedBadly, forgetCrash, record, samples,
  startBlackBox, takeSample,
} from "./blackBox";

const fakeStorage = () => {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    size: () => store.size,
  };
};

// A table, as the recorder sees one: seven cameras up and nothing churning.
const healthy = () => ({ open: 7, created: 7, closed: 0, iceRestarts: 0 });

const sources = (media = healthy) => ({
  media,
  documentRef: { hidden: false, querySelectorAll: () => ({ length: 7 }) },
  perf: { memory: { usedJSHeapSize: 300 * 1024 * 1024, jsHeapSizeLimit: 4096 * 1024 * 1024 } },
  locationRef: { pathname: "/tournament/12/play" },
});

describe("takeSample", () => {
  it("writes down what the page is holding", () => {
    const sample = takeSample(sources(), Date.parse("2026-08-25T20:00:00Z"));

    expect(sample).toMatchObject({
      path: "/tournament/12/play", peers: 7, pcOpened: 7, videos: 7, heapMB: 300,
    });
  });

  it("says nothing rather than guessing on a browser that will not tell it", () => {
    const sample = takeSample({ media: () => ({}), documentRef: null, perf: null, locationRef: null });

    expect(sample.peers).toBeNull();
    expect(sample.heapMB).toBeNull();
    expect(sample.path).toBe("");
  });
});

describe("the record", () => {
  beforeEach(() => vi.stubGlobal("sessionStorage", fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the last few minutes and no more", () => {
    for (let i = 0; i < 40; i += 1) record(sources(), Date.parse("2026-08-25T20:00:00Z") + i * 20_000);

    expect(samples()).toHaveLength(20);
    expect(samples().at(-1).at).toBe("2026-08-25T20:13:00.000Z");
  });

  it("survives storage that refuses to write", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => {},
    });

    expect(() => record(sources())).not.toThrow();
    expect(samples()).toEqual([]);
  });
});

describe("telling a killed tab from a closed one", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", fakeStorage());
    vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
    vi.stubGlobal("document", {
      hidden: false, visibilityState: "visible",
      addEventListener: () => {}, removeEventListener: () => {},
      querySelectorAll: () => ({ length: 7 }),
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("says nothing about a tab that was closed properly", () => {
    const stop = startBlackBox(sources());
    stop();                                   // what pagehide amounts to

    startBlackBox(sources());
    expect(endedBadly()).toBe(false);
  });

  // The whole point: a renderer that is killed fires no event at all, so the
  // only evidence is a run that never said goodbye.
  it("keeps the record of a tab that was killed", () => {
    startBlackBox(sources());
    vi.advanceTimersByTime(60_000);
    const before = samples().length;
    expect(before).toBeGreaterThan(1);
    // No stop(), no pagehide: the process was taken away.

    startBlackBox(sources());

    expect(endedBadly()).toBe(true);
    expect(crashSamples()).toHaveLength(before);
  });

  it("does not write the dead run's record over with the new one's", () => {
    startBlackBox(sources());
    vi.advanceTimersByTime(60_000);

    startBlackBox(sources());
    vi.advanceTimersByTime(200_000);

    expect(crashSamples()).not.toHaveLength(samples().length);
    expect(crashSamples()[0].peers).toBe(7);
  });

  it("is said once and then dropped", () => {
    startBlackBox(sources());
    startBlackBox(sources());
    expect(endedBadly()).toBe(true);

    forgetCrash();
    expect(endedBadly()).toBe(false);
  });
});

describe("what the crash is reported as", () => {
  // The number that names the cause: connections opened over the window. Seven
  // cameras that stay up open seven. A table churning them opens hundreds, and
  // looks exactly as healthy in any count of what is open at the time.
  it("shows churn that a snapshot would hide", () => {
    const churning = [
      { at: "2026-08-25T20:00:00.000Z", path: "/tournament/12/play", peers: 7, pcOpened: 7 },
      { at: "2026-08-25T20:07:00.000Z", path: "/tournament/12/play", peers: 7, pcOpened: 431 },
    ];

    const summary = crashSummary(churning);

    expect(summary.peers).toBe(7);
    expect(summary.openedOverWindow).toBe(424);
    expect(summary.minutes).toBe(7);
  });

  it("is a table somebody can paste into a message", () => {
    const report = blackBoxReport([takeSample(sources(), Date.parse("2026-08-25T20:00:00Z"))]);

    expect(report).toMatch(/peers\s+opened/);
    expect(report).toMatch(/20:00:00/);
    expect(report).toMatch(/\/tournament\/12\/play/);
  });

  it("has nothing to say when nothing was recorded", () => {
    expect(crashSummary([])).toBeNull();
    expect(blackBoxReport([])).toBe("");
  });
});
