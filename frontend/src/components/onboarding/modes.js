/**
 * The three things you can play, as a new player is introduced to them.
 *
 * Kept beside the onboarding rather than read off the lobby: this is the pitch
 * for each mode, not its live state, and it has to read the same whether or not
 * anybody happens to be sitting at a table right now. The tabs it describes are
 * LOBBY_TABS in LobbyPage. `icon` is a name in the app's own set
 * (components/icons), not an emoji: these are drawn, so they take the theme.
 */

export const MODES = [
  {
    key: "tournaments",
    icon: "trophy",
    label: "Tournaments",
    blurb: "A night somebody arranges: a start time, a structure, and everyone who "
      + "turns up. Played for coins, or for real money the app writes down and you settle "
      + "between yourselves.",
    detail: "Minutes to hours",
  },
  {
    key: "spingo",
    icon: "spin",
    label: "Spin n Go",
    blurb: "Three players and a prize drawn when the third one sits — usually twice the "
      + "buy-in, once in a while a hundred times it. Winner takes all of it.",
    detail: "3-5 min",
  },
  {
    key: "sitngo",
    icon: "duel",
    label: "Sit n Go",
    blurb: "Heads up or six-handed. You sit, and when the last seat fills the cards are "
      + "in the air. No draw — it pays out exactly what went in.",
    detail: "5-15 min",
  },
];

/** The tab a mode belongs to, which is what the lobby opens on. */
export function tabFor(key) {
  return MODES.find((mode) => mode.key === key)?.key || "tournaments";
}
