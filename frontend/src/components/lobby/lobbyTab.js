/**
 * Which room the lobby opens in.
 *
 * Somebody who plays Sit n Gos does not want the tournament list every time
 * they come home from a table — and going home from a table is something that
 * happens between every game, not once a session. So the tab is remembered.
 *
 * Kept in localStorage rather than on the account: it is where you were a
 * minute ago, not a preference about yourself, and it should not follow you
 * onto somebody else's computer.
 *
 * Pure so the fallback is testable, which is the part that matters — a stored
 * value can be anything at all, including a tab that no longer exists.
 */

export const TAB_KEY = "poker.lobbyTab";

/**
 * The tab to open, given whatever was stored and whatever tabs exist now.
 *
 * Falls back to the first tab for a value that is missing, corrupt, or names a
 * room that has since been removed.
 */
export function tabToOpen(stored, keys = []) {
  return keys.includes(stored) ? stored : (keys[0] ?? null);
}

/** What was last opened, or null if nothing was or storage is unavailable. */
export function readStoredTab() {
  try {
    return localStorage.getItem(TAB_KEY);
  } catch {
    // Private mode, or storage switched off. The lobby then opens where it
    // always did, which is a worse experience and not a broken one.
    return null;
  }
}

/** Remember it, if this browser lets us. */
export function writeStoredTab(key) {
  try {
    localStorage.setItem(TAB_KEY, key);
  } catch {
    // As above: nothing to do, and nothing worth telling anybody about.
  }
}
