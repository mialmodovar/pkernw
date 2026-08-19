import { beforeEach, describe, expect, it } from "vitest";

import {
  claimEntryRedirect,
  markArrivedAtTable,
  resetEntryRedirect,
  seatIsWaiting,
  tableToOpen,
} from "./autoOpenTable";

const mine = (over = {}) => ({
  id: 7, status: "running", is_joined: true, my_finish_position: null, ...over,
});

describe("seatIsWaiting", () => {
  it("is a seat of yours at a tournament that is dealing", () => {
    expect(seatIsWaiting(mine())).toBe(true);
  });

  it("is nobody else's tournament, and nothing that is not running", () => {
    expect(seatIsWaiting(mine({ is_joined: false }))).toBe(false);
    expect(seatIsWaiting(mine({ status: "lobby" }))).toBe(false);
    expect(seatIsWaiting(mine({ status: "finished" }))).toBe(false);
  });

  it("is not a seat you have been knocked out of", () => {
    expect(seatIsWaiting(mine({ my_finish_position: 4 }))).toBe(false);
  });
});

describe("tableToOpen", () => {
  it("opens a tournament that has just started under you", () => {
    const seen = new Map([[7, "lobby"]]);
    expect(tableToOpen([mine()], seen)).toBe(7);
  });

  it("leaves you where you are when nothing changed", () => {
    // Already running last time it looked, and the arrival redirect is spent:
    // this is the "back home from the table" case, and it must not drag you in.
    const seen = new Map([[7, "running"]]);
    expect(tableToOpen([mine()], seen)).toBeNull();
  });

  it("opens a tournament that was already running when the app opened", () => {
    expect(tableToOpen([mine()], new Map(), { entryPending: true })).toBe(7);
  });

  it("opens nothing on arrival when no seat of yours is playing", () => {
    const rows = [mine({ is_joined: false }), mine({ id: 8, status: "lobby" })];
    expect(tableToOpen(rows, new Map(), { entryPending: true })).toBeNull();
  });

  it("prefers the one that just started over one that was already running", () => {
    const rows = [mine({ id: 8 }), mine({ id: 9 })];
    const seen = new Map([[8, "running"], [9, "lobby"]]);
    expect(tableToOpen(rows, seen, { entryPending: true })).toBe(9);
  });

  it("does not start a tournament you were knocked out of before it ended", () => {
    const seen = new Map([[7, "lobby"]]);
    expect(tableToOpen([mine({ my_finish_position: 3 })], seen)).toBeNull();
  });
});

describe("claimEntryRedirect", () => {
  beforeEach(() => resetEntryRedirect());

  it("is good for one page load, whoever asks first", () => {
    expect(claimEntryRedirect()).toBe(true);
    expect(claimEntryRedirect()).toBe(false);
  });

  it("stays spent once an app that opened at a table has said so", () => {
    resetEntryRedirect(false);
    expect(claimEntryRedirect()).toBe(false);
  });
});

describe("a session, in the order the hook asks its questions", () => {
  // The hook calls tableToOpen once per poll with a Map it keeps across polls
  // and a fresh one per mount, so the sequence is what decides whether anybody
  // gets dragged anywhere. This walks it.
  const poll = (rows, seen) => {
    const id = tableToOpen(rows, seen, { entryPending: claimEntryRedirect() });
    for (const row of rows) seen.set(row.id, row.status);
    return id;
  };

  beforeEach(() => resetEntryRedirect());

  it("opens the table on arrival, and leaves you alone when you come back", () => {
    const home = new Map();
    // The app opens with your tournament already running.
    expect(poll([mine()], home)).toBe(7);

    // You play, then press "Back home" — a fresh mount, so a fresh Map. This is
    // the one that must not fire, or home is a page you cannot reach.
    const backHome = new Map();
    expect(poll([mine()], backHome)).toBeNull();
    expect(poll([mine()], backHome)).toBeNull();
  });

  it("waits at home until your tournament actually starts", () => {
    const home = new Map();
    expect(poll([mine({ status: "lobby" })], home)).toBeNull();
    expect(poll([mine({ status: "lobby" })], home)).toBeNull();
    expect(poll([mine()], home)).toBe(7);
  });
});

describe("markArrivedAtTable", () => {
  beforeEach(() => resetEntryRedirect());

  it("spends the arrival redirect, so the walk back is not an arrival", () => {
    // The app opened somewhere that concluded nothing — a login page, or a home
    // list that had not loaded — so the redirect is still going when the player
    // reaches a table by hand.
    markArrivedAtTable();

    const backHome = new Map();
    expect(tableToOpen([mine()], backHome, { entryPending: claimEntryRedirect() })).toBeNull();
  });
});
