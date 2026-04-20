/**
 * WebSocket singleton for a tournament.
 * Usage:
 *   import { connect, disconnect, send, onMessage } from './socket';
 *   connect(tournamentId);
 *   onMessage((data) => { ... });
 *   send({ type: 'player_action', action: 'fold' });
 */

let ws = null;
let listeners = [];

export function connect(tournamentId) {
  const token = localStorage.getItem("access");
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const url = `${proto}://${window.location.host}/ws/tournament/${tournamentId}/?token=${token}`;

  disconnect(); // close any existing connection

  ws = new WebSocket(url);

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    listeners.forEach((fn) => fn(data));
  };

  ws.onclose = () => {
    // Auto-reconnect after 2.5s
    setTimeout(() => {
      if (!ws || ws.readyState === WebSocket.CLOSED) {
        connect(tournamentId);
      }
    }, 2500);
  };

  ws.onerror = () => ws.close();
}

export function disconnect() {
  if (ws) {
    ws.onclose = null; // prevent auto-reconnect
    ws.close();
    ws = null;
  }
}

export function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

export function onMessage(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export function clearListeners() {
  listeners = [];
}
