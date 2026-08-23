/**
 * Which socket to open, for which kind of table.
 *
 * There are two rooms a hand can be dealt in — a tournament and a cash table —
 * and from the client's side they differ in exactly one thing: the path. The
 * events that come back are the same events, because they come off the same
 * engine, which is why the felt does not know or care which it is looking at.
 *
 * Pure, so the one thing that does differ is written down once and can be read.
 */

/** The path for a room, without the host or the token. */
export function socketPath(kind, id) {
  if (kind === "cash") return `/ws/cash/${id}/`;
  return `/ws/tournament/${id}/`;
}

/** The whole URL, with whatever this room needs on the end of it. */
export function socketUrl(kind, id, { token, spectateTable = null, host, secure } = {}) {
  const proto = secure ? "wss" : "ws";
  const query = [
    `token=${token}`,
    // Watching from the rail is a different connection to playing: the server
    // sends no hole cards down it and refuses anything sent up it. Tournaments
    // only — at a cash table the rail is the same socket without a seat.
    ...(kind !== "cash" && spectateTable != null
      ? ["spectate=1", `table=${encodeURIComponent(spectateTable)}`]
      : []),
  ].join("&");
  return `${proto}://${host}${socketPath(kind, id)}?${query}`;
}
