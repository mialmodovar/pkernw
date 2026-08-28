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
 * The two things this app is: games that are arranged, and rooms you walk into.
 *
 * A flat strip of five was fine at three and stopped being a strip at five —
 * and worse, it put "Spin n Go" and "Cash" on the same footing, when one is a
 * kind of tournament and the other is the other half of the app. So: two tabs,
 * and the kinds of tournament inside the tournament one.
 *
 * `formats` is which of the instant formats a room shows. Null on the scheduled
 * tab, which is the one place games are arranged rather than sat down at, on
 * cash, which draws its own browser entirely, and on the casino, which is not
 * poker at all.
 */
export const LOBBY_TABS = [
  {
    key: "tournaments",
    label: "Tournaments",
    icon: "trophy",
    rooms: [
      { key: "scheduled", label: "Scheduled", icon: "trophy", formats: null },
      { key: "spingo", label: "Spin n Go", icon: "spin", formats: ["spingo"] },
      { key: "sitngo", label: "Sit n Go", icon: "duel", formats: ["hu", "sixmax"] },
      { key: "allinfold", label: "All In or Fold", icon: "shove", formats: ["allinfold"] },
    ],
  },
  {
    key: "cash",
    label: "Cash games",
    icon: "coin",
    // A cash table is a room rather than a game that starts and ends, so there
    // is nothing to divide it into: the stakes are the rooms, and the browser
    // draws them.
    rooms: [{ key: "cash", label: "Cash", icon: "coin", formats: null, cash: true }],
  },
  {
    key: "casino",
    label: "Casino",
    icon: "casino",
    // The third thing this app is, and the only one that is not poker: a game
    // against the house, alone, in coins. It gets a tab of its own rather than
    // a room inside the tournaments, because the tournaments tab is kinds of
    // tournament and this is not one — and because the thing that makes it
    // worth having is that it is somewhere to go while you wait, which means it
    // has to be findable in one press from anywhere.
    //
    // Coins only, always. The euros in this app are debts between people that
    // it writes down and never touches; a game played against the house for
    // them would be the app taking money, which it does not do and must not
    // start doing.
    rooms: [{ key: "blackjack", label: "Blackjack", icon: "casino", formats: null, casino: "blackjack" }],
  },
];

/** Both levels, as the pair the lobby opens on. */
export function openTabs(stored) {
  const [top, room] = String(stored || "").split(":");
  const tab = LOBBY_TABS.find((one) => one.key === top) || LOBBY_TABS[0];
  const inside = tab.rooms.find((one) => one.key === room) || tab.rooms[0];
  return { tab, room: inside };
}

/** What to remember, given where somebody is. */
export function storedKey(tabKey, roomKey) {
  return `${tabKey}:${roomKey}`;
}

/**
 * The tab to open, given whatever was stored and whatever tabs exist now.
 *
 * Falls back to the first tab for a value that is missing, corrupt, or names a
 * room that has since been removed. Kept beside openTabs above, which is the
 * two-level version of the same question — this one still answers for a single
 * strip, which is what the stats panel and the filters use.
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
