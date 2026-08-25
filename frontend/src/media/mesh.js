/** The decisions behind the camera mesh, kept pure so they can be tested.
 *
 * Everything else in this folder talks to `RTCPeerConnection`, which only runs
 * in a real browser. What is actually easy to get wrong — who we should be
 * connected to, who offers first, how much bandwidth each stream may take — is
 * here instead.
 */

/** Who I should have a live connection to, right now.
 *
 * The single invariant of the whole feature: players at my table, still in the
 * tournament, with media on, minus me. Everything that moves — a rebalance, a
 * bust-out, someone switching their camera off — is just this set changing.
 */
export function desiredPeers(players, roster, myUserId, myTableNumber) {
  const seated = new Map(
    (players || [])
      .filter((player) => player.user_id != null)
      .map((player) => [player.user_id, player]),
  );

  // Off the roster rather than off the seats. The roster is the server's answer
  // to "who is at this table with a camera on", and not everybody at a table has
  // a seat: somebody watching it is there too, and reading the mesh off the
  // seating plan left them connected to nobody while nobody connected to them.
  //
  // A seat still decides one thing — whether they are at this table rather than
  // another one — because that is what the seat knows and the roster does not.
  //
  // What it deliberately does NOT decide any more is whether somebody has
  // busted. It used to, and that is the one thing in here that both sides could
  // not agree on: a player who busts keeps their seat, marked eliminated, so
  // everybody still in the tournament dropped them from the mesh — while they,
  // reading the same table, still wanted everybody. One side hangs up, the other
  // side sees the connection fail, restarts ICE, connects, and is hung up on
  // again, for as long as the tournament lasts. Every cycle is a fresh
  // RTCPeerConnection on every remaining player's machine, a burst of
  // signalling, and a camera flickering on and off at a seat. An evening of that
  // is a renderer that runs out of room, which is a tab that dies with nothing
  // in any log to say why.
  //
  // And a busted player who stays to watch is a watcher: the rail is already in
  // the mesh on purpose, and a seat they no longer play is no reason to make a
  // one-way mirror of them. One who actually leaves drops off the roster, which
  // is what takes them out of the mesh.
  return (roster || [])
    .filter((peer) => peer.user_id != null && peer.user_id !== myUserId)
    .filter((peer) => {
      const player = seated.get(peer.user_id);
      if (!player) return true;               // on the rail: the roster is enough
      return player.table_number === myTableNumber;
    })
    .map((peer) => ({
      userId: peer.user_id,
      // Their own name where there is no seat to read one off.
      name: seated.get(peer.user_id)?.name || peer.name || "",
      ...peer,
    }));
}

/** Which side gives way when both offer at once.
 *
 * WebRTC needs one side to yield in a collision, and the rule only works if
 * both peers reach the opposite answer from the same two numbers. Comparing
 * user ids does that without a round trip.
 */
export function isPolite(myUserId, peerUserId) {
  return myUserId < peerUserId;
}

/** How much bandwidth each outgoing video may use, given the table size.
 *
 * In a mesh every player uploads one copy per peer, so the cost of the table
 * grows with the square of the room while a home connection stays the same
 * size. These tiers keep the total upload under roughly 0.8 Mbps at a full
 * table, and cap CPU too — eight encoders is real work for a laptop.
 */
export function bitrateTier(peerCount) {
  if (peerCount <= 2) return { maxBitrate: 250_000, maxFramerate: 20, scaleResolutionDownBy: 1 };
  if (peerCount <= 4) return { maxBitrate: 150_000, maxFramerate: 15, scaleResolutionDownBy: 1 };
  if (peerCount <= 6) return { maxBitrate: 100_000, maxFramerate: 12, scaleResolutionDownBy: 1.5 };
  return { maxBitrate: 70_000, maxFramerate: 10, scaleResolutionDownBy: 2 };
}

/** Speech, mono, and the same everywhere — voice does not need a ladder. */
export const AUDIO_BITRATE = 32_000;

export const MEDIA_CONSTRAINTS = {
  video: {
    width: { ideal: 320 },
    height: { ideal: 240 },
    frameRate: { ideal: 15, max: 20 },
    facingMode: "user",
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  },
};

// Public STUN, and whatever else the server says — see backend/game/ice.py.
// Without a relay some pairs never connect at all, and a player on mobile data
// is behind carrier-grade NAT and connects to nobody: that is a failure the
// interface has to show rather than hide, and it is the one this list is asked
// for rather than hard-coded to fix.
export const ICE_SERVERS = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

/**
 * What to tell somebody whose cameras are all failing.
 *
 * A table where every peer fails while your own camera is on is not five
 * separate accidents. It is one thing — your network will not let anybody reach
 * you directly — and whether it can be fixed at all depends on whether a relay
 * exists to fall back to. Mobile data is the usual way to arrive here.
 */
export function meshFailureMessage({ peerCount, failedCount, relay, cameraOn }) {
  if (!cameraOn || peerCount === 0 || failedCount < peerCount) return "";
  if (peerCount === 1) {
    return relay
      ? "Could not connect to that camera."
      : "Could not connect to that camera. One of you is on a network that needs a relay.";
  }
  return relay
    ? "Could not connect to anybody's camera. Something is blocking video on this network."
    : "Could not connect to anybody's camera — this network needs a relay, and there is "
      + "none set up. Mobile data does this: the game itself is unaffected.";
}

/** What to tell a player whose browser refused the camera or microphone. */
export function permissionMessage(error) {
  switch (error?.name) {
    case "NotAllowedError":
      return "Access denied. Allow the camera and microphone in your site permissions.";
    case "NotFoundError":
      return "No camera or microphone found on this device.";
    case "NotReadableError":
      return "The camera is in use by another application.";
    default:
      return "Could not start the camera or microphone.";
  }
}

/** Whether a failed connection is worth another ICE restart.
 *
 * A route can change mid-game, and one restart puts the picture back. What this
 * is really guarding against is the other case: a pair that connects, is torn
 * down, fails, restarts, connects and is torn down again. Resetting the count
 * on every `connected` made that loop free to run for the length of a
 * tournament — the connection really did come up each time, so nothing ever
 * counted as giving up.
 *
 * So a restart is only forgiven by a connection that LASTED. Anything that
 * comes up and dies again inside `STABLE_MS` is the loop, and after a few of
 * those the pair is left alone: a camera that will not stay up is a picture
 * missing from one circle, while retrying it forever costs the whole table.
 */
export const MAX_ICE_RESTARTS = 3;
export const STABLE_MS = 30_000;

export function shouldRestartIce({ restarts = 0, connectedFor = null } = {}) {
  // A connection that held is proof the pair works; the count starts again.
  if (connectedFor != null && connectedFor >= STABLE_MS) return { restart: true, restarts: 1 };
  if (restarts >= MAX_ICE_RESTARTS) return { restart: false, restarts };
  return { restart: true, restarts: restarts + 1 };
}

/** How many connections a table may honestly need to open, and over how long.
 *
 * A full table opens seven. A rebalance closes them and opens seven more. A
 * night of people arriving, leaving and switching cameras on and off might
 * reach a couple of dozen. Nothing legitimate reaches sixty in five minutes.
 *
 * So sixty in five minutes is not a table being busy — it is two sides of the
 * mesh disagreeing about who belongs in it, one hanging up and the other
 * calling back, which is exactly what killed the browser once. The specific
 * disagreement that caused it is fixed; this is here so that the next one, in
 * code nobody has written yet, costs a picture instead of the tab.
 */
export const OPEN_BUDGET = 60;
export const OPEN_WINDOW_MS = 5 * 60 * 1000;

/**
 * Whether another connection may be opened, given when the recent ones were.
 *
 * Returns the trimmed list along with the verdict, so the caller keeps a window
 * rather than a tally that only ever grows. Refusing is temporary by
 * construction: once the burst falls out of the window the table opens
 * connections again without anybody doing anything.
 */
export function mayOpenPeer(opened, now) {
  const recent = opened.filter((at) => now - at < OPEN_WINDOW_MS);
  return { allowed: recent.length < OPEN_BUDGET, recent };
}
