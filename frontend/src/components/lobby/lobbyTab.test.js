import { describe, expect, it } from "vitest";

import { tabToOpen } from "./lobbyTab";

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
