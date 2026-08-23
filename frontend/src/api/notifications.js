/**
 * The browser's own notifications, for when the app is not the window in front.
 *
 * A poker app has exactly one thing worth interrupting somebody for: a game
 * they paid to sit at has started without them. So this asks for permission at
 * the moment they sit down — a gesture, and the moment the permission is
 * obviously about — rather than on page load, which is the pattern everybody
 * has learned to refuse.
 *
 * Everything here degrades to nothing. No Notification API, permission refused,
 * or an insecure origin all mean the in-app banner and the sound are the whole
 * alert, which is enough while the tab is open.
 */

const ASKED_KEY = "poker.notificationsAsked";

const supported = () => typeof window !== "undefined" && "Notification" in window;

/** Whether a notification would actually appear if we sent one. */
export function allowed() {
  return supported() && Notification.permission === "granted";
}

/**
 * Ask, once ever, from inside a click.
 *
 * Asked once rather than on every sit: a player who said no meant it, and a
 * player who dismissed the prompt without answering gets a browser that
 * silently refuses from then on anyway. Re-prompting would only be us being
 * refused more often.
 */
export function askOnce() {
  if (!supported() || Notification.permission !== "default") return;
  try {
    if (localStorage.getItem(ASKED_KEY)) return;
    localStorage.setItem(ASKED_KEY, "1");
  } catch {
    // No storage means we may ask again on the next sit. The browser's own
    // refusal-after-dismissal still stops that becoming a nuisance.
  }
  // The promise form and the callback form both exist in the wild; neither is
  // awaited, because nothing here depends on the answer.
  try {
    Notification.requestPermission();
  } catch {
    // Some browsers throw on the promise form in an insecure context.
  }
}

/**
 * Put one up, if we are allowed and the app is not already in front.
 *
 * Not while the tab is visible: the banner is on screen, and an OS toast
 * repeating it is two interruptions for one event.
 *
 * `tag` collapses repeats of the same news — a reconnect that redelivers the
 * message must not stack a second toast for the same game.
 */
export function notify({ title, body, tag, onClick }) {
  if (!allowed()) return null;
  if (typeof document !== "undefined" && document.visibilityState === "visible") return null;
  try {
    const note = new Notification(title, { body, tag, icon: "/favicon.svg" });
    note.onclick = () => {
      window.focus();
      note.close();
      onClick?.();
    };
    return note;
  } catch {
    // Android Chrome throws here unless the notification comes from a service
    // worker. There is no service worker in this app, and the sound and the
    // banner still land.
    return null;
  }
}
