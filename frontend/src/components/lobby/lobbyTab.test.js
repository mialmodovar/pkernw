import { describe, expect, it } from "vitest";

import { LOBBY_TABS, openTabs, storedKey, tabToOpen } from "./lobbyTab";

const KEYS = ["tournaments", "spingo", "sitngo"];

describe("tabToOpen", () => {
  it("opens where you were", () => {
    expect(tabToOpen("sitngo", KEYS)).toBe("sitngo");
    expect(tabToOpen("spingo", KEYS)).toBe("spingo");
  });

  it("opens on the first tab for somebody who has never chosen one", () => {
    expect(tabToOpen(null, KEYS)).toBe("tournaments");
    expect(tabToOpen(undefined, KEYS)).toBe("tournaments");
  });

  it("ignores a room that no longer exists", () => {
    // A tab removed in an update, or a value somebody typed into storage.
    expect(tabToOpen("draw-poker", KEYS)).toBe("tournaments");
    expect(tabToOpen("[]", KEYS)).toBe("tournaments");
  });

  it("has nothing to open when there are no tabs at all", () => {
    expect(tabToOpen("spingo", [])).toBe(null);
  });
});

describe("the two levels", () => {
  it("is tournaments and cash, and the kinds of tournament are inside one of them", () => {
    expect(LOBBY_TABS.map((one) => one.key)).toEqual(["tournaments", "cash"]);
    expect(LOBBY_TABS[0].rooms.map((one) => one.key))
      .toEqual(["scheduled", "spingo", "sitngo", "allinfold"]);
  });

  it("opens exactly where somebody left off", () => {
    const { tab, room } = openTabs("tournaments:sitngo");
    expect(tab.key).toBe("tournaments");
    expect(room.key).toBe("sitngo");
  });

  it("opens the cash room from the cash tab", () => {
    const { tab, room } = openTabs("cash:cash");
    expect(tab.key).toBe("cash");
    expect(room.cash).toBe(true);
  });

  it("falls back to the first of each for anybody who has never chosen", () => {
    const { tab, room } = openTabs(null);
    expect(tab.key).toBe("tournaments");
    expect(room.key).toBe("scheduled");
  });

  it("ignores a room that no longer exists, and a tab that never did", () => {
    // A tab removed in an update, and the flat keys stored before there were
    // two levels at all.
    expect(openTabs("tournaments:draw-poker").room.key).toBe("scheduled");
    expect(openTabs("spingo").tab.key).toBe("tournaments");
    expect(openTabs("cash").room.cash).toBe(true);
  });

  it("writes the pair down as one value", () => {
    expect(storedKey("tournaments", "spingo")).toBe("tournaments:spingo");
  });
});
