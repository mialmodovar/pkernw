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

// A notification body is plain text handed to the operating system, so the
// app's own drawn coin cannot go in it. The word can, and reads the same
// everywhere — which the system emoji does not: it is a different picture on
// every platform and none of them is the one in the header.
const coins = (amount) => `${Number(amount || 0).toLocaleString()} coins`;

/**
 * What the banner and the notification both say.
 *
 * The format's own name leads, because with seats at several tiers "your game"
 * names nothing. The prize follows, because it is why the player sat down, and
 * for a Spin n Go it is the number that was drawn seconds ago and that they
 * have not seen yet.
 */
export function alertText(game, kind = "started") {
  const label = game?.label || "Your game";
  const soon = kind === "starting";
  const title = soon ? `${label} starts soon` : `${label} is dealing`;
  const parts = [];
  if (soon && game?.starts_in_seconds > 0) {
    parts.push(`in about ${Math.round(game.starts_in_seconds / 60)} min`);
  }
  if (game?.spin_multiplier > 0) parts.push(`${game.spin_multiplier}× drawn`);
  if (game?.prize_coins > 0) parts.push(`${coins(game.prize_coins)} up`);
  parts.push(soon ? "take your seat" : "your seat is waiting");
  return { title, body: parts.join(" · ") };
}

/**
 * What the app does with one of these messages.
 *
 * Three kinds now, and they differ in what they mean rather than in how they
 * look: a queue that filled, a tournament that just started, and one that is
 * about to. The first two put somebody at a table; the third tells them to get
 * ready, and is the only one that is not answered by arriving.
 *
 * Returns null for anything else on the socket, which is how a client older
 * than the server stays quiet rather than guessing.
 */
export function readAlert(message) {
  const kinds = {
    fast_game_started: { kind: "started", refresh: "fast" },
    tournament_started: { kind: "started", refresh: "lobby" },
    tournament_starting: { kind: "starting", refresh: "lobby" },
  };
  const known = kinds[message?.type];
  if (!known || !message?.game?.id) return null;
  return { ...known, game: message.game, tag: `${message.type}-${message.game.id}` };
}

/**
 * Where the banner's button goes.
 *
 * A tournament that has started has a table to sit at. One that starts in five
 * minutes does not yet — sending somebody to a felt with no hands on it is a
 * dead end — so that one opens the tournament's own page, where the countdown
 * and the seat list are.
 */
export function alertPath(game) {
  return game?.kind === "starting" ? `/tournament/${game.id}` : tablePath(game?.id);
}

/**
 * Whether being on this page answers the alert.
 *
 * Arriving is the answer, however you arrived — by pressing the button or by
 * finding your own way there. For a game that has started that means the felt;
 * for one that has not, anywhere in that tournament will do.
 */
export function alertAnswered(pathname, game) {
  if (!game?.id) return false;
  if (game.kind === "starting") {
    return new RegExp(`^/tournament/${game.id}(?:/|$)`).test(String(pathname || ""));
  }
  return isAtTable(pathname, game.id);
}
