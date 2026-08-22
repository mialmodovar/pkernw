/**
 * Whether a game starting is worth interrupting somebody for, and what to say.
 *
 * Pure, and apart from the component, because the interesting part is the
 * judgement rather than the markup: an alert that fires when the player is
 * already looking at the table is worse than no alert, and one that says
 * "your game has started" without saying *which* game is useless to somebody
 * holding seats at three tiers.
 */

/** The table page for a game, which is where every path here ends. */
export function tablePath(gameId) {
  return `/tournament/${gameId}/play`;
}

/**
 * Is this news?
 *
 * The one case that is not: you are already at that table. Your own socket is
 * dealing you cards and a banner over the top of them telling you the game has
 * started is the app talking to itself.
 *
 * Being at a *different* table is exactly when this matters most, so that is
 * not an exception — it is the reason the whole thing exists.
 */
export function worthTelling({ pathname = "", gameId } = {}) {
  if (!gameId) return false;
  return !isAtTable(pathname, gameId);
}

/** Whether this path is the felt of that game — playing it or watching it. */
export function isAtTable(pathname, gameId) {
  const match = String(pathname || "").match(/^\/tournament\/(\d+)\/(play|watch)\b/);
  return Boolean(match) && Number(match[1]) === Number(gameId);
}

const coins = (amount) => `\u{1FA99} ${Number(amount || 0).toLocaleString()}`;

/**
 * What the banner and the notification both say.
 *
 * The format's own name leads, because with seats at several tiers "your game"
 * names nothing. The prize follows, because it is why the player sat down, and
 * for a Spin n Go it is the number that was drawn seconds ago and that they
 * have not seen yet.
 */
export function alertText(game) {
  const label = game?.label || "Your game";
  const title = `${label} is dealing`;
  const parts = [];
  if (game?.spin_multiplier > 0) parts.push(`${game.spin_multiplier}× drawn`);
  if (game?.prize_coins > 0) parts.push(`${coins(game.prize_coins)} up`);
  parts.push("your seat is waiting");
  return { title, body: parts.join(" · ") };
}
