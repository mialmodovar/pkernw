/**
 * What the tab was doing when it fell over.
 *
 * A table that dies takes its console with it, and every report we get is a
 * player saying "it just crashed" from their sitting room. Nothing on the
 * server sees any of it — media goes browser to browser and a render that
 * throws never asks the server anything — so unless the page writes it down,
 * there is nothing to read afterwards.
 *
 * sessionStorage rather than memory, because the useful moment is *after* the
 * reload: the entry written a second before the page went is still there when
 * it comes back, and the crash screen can show it to whoever is sitting there.
 * It dies with the tab, like everything else about a session.
 */

const KEY = "poker.crashes";
const LIMIT = 5;
// Enough to identify the throw, not so much that a stack fills the quota.
const STACK_CHARS = 2000;

/** Everything written down this session, newest last. */
export function crashes() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function forgetCrashes() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing depends on it.
  }
}

/** One line per crash, for a player to copy into a message to us. */
export function crashReport(entries = crashes()) {
  return entries
    .map((one) => [
      `${one.at}  ${one.where}`,
      `${one.message}`,
      one.stack || "",
      `page: ${one.url}`,
      `build: ${one.build}`,
      `browser: ${one.agent}`,
    ].filter(Boolean).join("\n"))
    .join("\n\n");
}

/**
 * Write one down.
 *
 * Never throws, whatever it is handed: this runs on the way out of a failure
 * and a reporter that fails takes the report with it.
 */
export function noteCrash(error, where = "render") {
  const entry = {
    at: new Date().toISOString(),
    where,
    message: String(error?.message || error || "Unknown error"),
    stack: String(error?.stack || "").slice(0, STACK_CHARS),
    url: typeof location === "undefined" ? "" : location.pathname,
    build: typeof __BUILD_STAMP__ === "undefined" ? "" : __BUILD_STAMP__,
    agent: typeof navigator === "undefined" ? "" : navigator.userAgent,
  };
  // The console first and always. A developer watching a live table should not
  // have to know this file exists.
  console.error(`[${where}]`, error);
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...crashes(), entry].slice(-LIMIT)));
  } catch {
    // Private mode or a full quota. The console line above still happened.
  }
  return entry;
}

/**
 * Catch what React never sees.
 *
 * An error boundary only catches a throw during a render. The ones that have
 * been hardest to chase are the others — a promise nobody awaited, a callback
 * from the websocket, a WebRTC event handler — and those reach nothing but the
 * console of a tab that is about to be closed.
 */
export function watchForCrashes(target = window) {
  const onError = (event) => noteCrash(event.error || event.message, "window");
  const onRejection = (event) => noteCrash(event.reason, "promise");
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}
