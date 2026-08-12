/**
 * WebSocket singleton for a tournament.
 * Usage:
 *   import { connect, disconnect, send, onMessage, onStatus } from './socket';
 *   connect(tournamentId);
 *   onMessage((data) => { ... });
 *   onStatus((status) => { ... });   // connecting | open | reconnecting | failed
 *   send({ type: 'player_action', action: 'fold' });
 */

const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

let ws = null;
let listeners = [];
let statusListeners = [];
let status = "connecting";
let reconnectTimer = null;
let attempts = 0;
let currentTournamentId = null;

function setStatus(next) {
  if (status === next) return;
  status = next;
  statusListeners.forEach((fn) => fn(status));
}

// Exponential backoff with jitter. Without a cap, a permanently rejected
// connection (expired token, or not a player in this tournament — the server
// closes both immediately) would retry forever with nothing surfaced.
function reconnectDelay() {
  const capped = Math.min(BASE_DELAY_MS * 2 ** (attempts - 1), MAX_DELAY_MS);
  return capped * (0.75 + Math.random() * 0.5);
}

function open(tournamentId) {
  currentTournamentId = tournamentId;
  const token = localStorage.getItem("access");
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const url = `${proto}://${window.location.host}/ws/tournament/${tournamentId}/?token=${token}`;

  const socket = new WebSocket(url);
  ws = socket;

  socket.onopen = () => {
    attempts = 0;
    setStatus("open");
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    listeners.forEach((fn) => fn(data));
  };

  socket.onclose = () => {
    // Only the live socket may schedule a reconnect — a stale one whose
    // replacement is already connecting must not.
    if (ws !== socket) return;
    ws = null;

    if (attempts >= MAX_ATTEMPTS) {
      setStatus("failed");
      return;
    }
    attempts += 1;
    setStatus("reconnecting");
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      open(tournamentId);
    }, reconnectDelay());
  };

  socket.onerror = () => socket.close();
}

export function connect(tournamentId) {
  disconnect();
  attempts = 0;
  setStatus("connecting");
  open(tournamentId);
}

export function disconnect() {
  // The timer handle has to be held, or a pending reconnect resurrects a
  // socket the caller explicitly tore down.
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    const socket = ws;
    ws = null;          // stops onclose from scheduling a reconnect
    socket.onclose = null;
    socket.close();
  }
  currentTournamentId = null;
}

/** Force an immediate retry after the backoff has given up. */
export function retry() {
  if (currentTournamentId == null) return;
  connect(currentTournamentId);
}

export function isOpen() {
  return ws != null && ws.readyState === WebSocket.OPEN;
}

export function send(data) {
  if (isOpen()) {
    ws.send(JSON.stringify(data));
    return true;
  }
  // Callers must know: a swallowed action becomes a timeout fold server-side.
  return false;
}

export function onMessage(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export function onStatus(fn) {
  statusListeners.push(fn);
  fn(status);
  return () => {
    statusListeners = statusListeners.filter((l) => l !== fn);
  };
}

export function clearListeners() {
  listeners = [];
  statusListeners = [];
}
