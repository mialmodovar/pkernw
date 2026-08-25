import { beforeEach, describe, expect, it } from "vitest";

// The tests run in node, where there is no localStorage. The store already
// survives its absence — that is what its try/catch is for — but the one thing
// worth checking here is that a look is remembered across a reload, so it gets
// the smallest thing that behaves like one. Installed before the store is
// imported, since it reads what was remembered as it loads.
const kept = new Map();
globalThis.localStorage = {
  getItem: (key) => (kept.has(key) ? kept.get(key) : null),
  setItem: (key, value) => kept.set(key, String(value)),
  removeItem: (key) => kept.delete(key),
  clear: () => kept.clear(),
};

const { default: useInboxStore } = await import("./inboxStore");

const item = (id, extra = {}) => ({ id, kind: "friend_request", title: id, ...extra });

describe("the bell's list", () => {
  beforeEach(() => {
    localStorage.clear();
    useInboxStore.setState({ items: [], seen: [], loaded: false });
  });

  it("puts the newest arrival first", () => {
    useInboxStore.getState().add(item("friend_request:1"));
    useInboxStore.getState().add(item("friend_request:2"));

    expect(useInboxStore.getState().items.map((one) => one.id))
      .toEqual(["friend_request:2", "friend_request:1"]);
  });

  it("counts the same news once, however many times it arrives", () => {
    // The socket delivers it and a reload asks for it again: one thing to do.
    useInboxStore.getState().add(item("friend_request:1"));
    useInboxStore.getState().add(item("friend_request:1", { title: "again" }));

    expect(useInboxStore.getState().items).toHaveLength(1);
    expect(useInboxStore.getState().items[0].title).toBe("again");
  });

  it("stamps an arrival that carries no time, so the list can be ordered", () => {
    useInboxStore.getState().add(item("friend_request:1"));

    expect(useInboxStore.getState().items[0].at).toBeTruthy();
  });

  it("ignores anything with no id, which is anything it could not de-duplicate", () => {
    useInboxStore.getState().add({ kind: "friend_request", title: "who?" });

    expect(useInboxStore.getState().items).toEqual([]);
  });

  it("glows for what has not been looked at, and stops once it has", () => {
    useInboxStore.getState().add(item("friend_request:1"));
    useInboxStore.getState().add(item("friend_request:2"));
    expect(useInboxStore.getState().unseenCount()).toBe(2);

    useInboxStore.getState().markSeen();

    expect(useInboxStore.getState().unseenCount()).toBe(0);
    // Looking is not answering: the two requests are still there to answer.
    expect(useInboxStore.getState().items).toHaveLength(2);
  });

  it("glows again for something that arrives after the look", () => {
    useInboxStore.getState().add(item("friend_request:1"));
    useInboxStore.getState().markSeen();

    useInboxStore.getState().add(item("friend_request:9"));

    expect(useInboxStore.getState().unseenCount()).toBe(1);
  });

  it("remembers what was seen across a reload", () => {
    useInboxStore.getState().add(item("friend_request:1"));
    useInboxStore.getState().markSeen();

    // What a fresh page does: the same server list, a new store.
    useInboxStore.setState({ items: [item("friend_request:1")], seen: JSON.parse(localStorage.getItem("poker.inbox.seen")) });

    expect(useInboxStore.getState().unseenCount()).toBe(0);
  });

  it("drops an item answered here rather than waiting to be told", () => {
    useInboxStore.getState().add(item("friend_request:1"));

    useInboxStore.getState().drop("friend_request:1");

    expect(useInboxStore.getState().items).toEqual([]);
  });
});
