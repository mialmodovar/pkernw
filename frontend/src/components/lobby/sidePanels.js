/**
 * The panels beside the lobby, as a list rather than as a column of markup.
 *
 * On a wide screen they are a sidebar and all of them are open at once, which
 * is what a sidebar is for. On a phone that same column is eight blocks stacked
 * above the thing you came for — the games — and the games are below the fold
 * before you have read a word. So there they become a row of icons, one open at
 * a time, closed until asked for.
 *
 * Which panels there are, and the "one at a time" rule, live here: both are
 * judgements, and the rule in particular is the sort of thing that ends up
 * written twice and disagreeing with itself.
 */

/**
 * In the order they are worth opening.
 *
 * Missions first: what is worth playing for today is what decides which game
 * you open, so it comes before the rest. Coins are deliberately absent — they
 * are on the header of every page, and a panel repeating a number two inches
 * below it is a panel nobody reads.
 *
 * The label is not decoration. On a phone the strip prints it under the icon,
 * so this list is the one place each panel is named and the word on the button
 * cannot drift from the word in the heading it opens.
 *
 * Every icon here is drawn for the panel it opens. Missions and Friends spent a
 * while pointing at `check` and `eye`, which are a tick labelled "Yes" and a
 * spectator seat labelled "Watching" — near enough to pick in a hurry, and both
 * saying something the panel does not mean.
 */
export const SIDE_PANELS = [
  { key: "missions", label: "Missions", icon: "missions" },
  { key: "stats", label: "Stats", icon: "stats" },
  { key: "calotes", label: "Calotes", icon: "ledger" },
  { key: "friends", label: "Friends", icon: "friends" },
  { key: "clubs", label: "Clubs", icon: "clubs" },
  // Not in the row the way the others are: it is drawn as your own face, which
  // is both the icon and the thing it opens.
  { key: "profile", label: "You", icon: null },
];

/**
 * What is open after pressing `key`, given what is open now.
 *
 * One at a time, and pressing the open one closes it: on a phone the panel is
 * most of the screen, so the way out of it has to be the way in.
 */
export function toggleOpen(current, key) {
  if (!SIDE_PANELS.some((one) => one.key === key)) return current;
  return current === key ? null : key;
}

/** Whether a key names a panel at all. Guards a remembered value. */
export function isPanel(key) {
  return SIDE_PANELS.some((one) => one.key === key);
}
