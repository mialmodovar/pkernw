/**
 * The presence socket: open for as long as the app is.
 *
 * Silent upwards. Its first job is to exist, so the server can tell the
 * difference between somebody who has the app open and somebody who does not —
 * a green dot on a watch list, nothing more.
 *
 * Its second job is to be the one connection that is not about a particular
 * page, which makes it the only way to be told something while you are looking
 * at something else: that a game you queued for twenty minutes ago has started
 * while you were at a different table. Nothing is ever broadcast down it — see
 * accounts/notify.py — so what arrives here is always this player's own news.
 *
 * Its own singleton rather than a second use of socket.js: that one belongs to
 * a tournament and dies with it, and this one has to outlive every page.
 */

// Far lazier than the game socket's, deliberately. A deploy brings every
// client back at once and each reconnect costs the server a token verify and a
// user lookup on the same event loop the tournaments run on. A dot that
// arrives half a minute late costs nobody anything.
const BASE_DELAY_MS = 5000;
const MAX_DELAY_MS = 60000;

let ws = null;
let reconnectTimer = null;
let attempts = 0;
let wanted = false;
let listeners = [];

function delay() {
  const capped = Math.min(BASE_DELAY_MS * 2 ** attempts, MAX_DELAY_MS);
  return capped * (0.5 + Math.random());
}

function open() {
  const token = localStorage.getItem("access");
  if (!token) return;

  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${proto}://${window.location.host}/ws/presence/?token=${token}`);
  ws = socket;

  socket.onopen = () => { attempts = 0; };

  socket.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      // Nothing readable is nothing to act on, and this socket must survive
      // anything that arrives on it: it is what holds the player online.
      return;
    }
    listeners.forEach((fn) => fn(data));
  };

  socket.onclose = () => {
    // A stale socket whose replacement is already connecting must not schedule
    // a reconnect of its own.
    if (ws !== socket) return;
    ws = null;
    if (!wanted) return;
    attempts += 1;
    reconnectTimer = setTimeout(open, delay());
  };
}

export function connect() {
  wanted = true;
  if (ws || reconnectTimer) return;
  open();
}

/** Listen to what the server says while you are elsewhere in the app.
 *
 * Each subscriber removes its own listener and only its own, so one component
 * unmounting cannot silence another.
 */
export function onMessage(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((one) => one !== fn);
  };
}

export function disconnect() {
  wanted = false;
  attempts = 0;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  const socket = ws;
  ws = null;
  socket?.close();
}

// A phone that has been asleep wakes with the socket already dead and no close
// event delivered until the tab is looked at again, so coming back to the app
// is its own reason to check.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !wanted) return;
    if (ws && ws.readyState === WebSocket.OPEN) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    attempts = 0;
    // Closed explicitly: a socket still connecting would otherwise land after
    // its replacement and leave the server counting a client twice.
    const stale = ws;
    ws = null;
    stale?.close();
    open();
  });
}
