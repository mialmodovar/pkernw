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
  // A seat still decides one thing — whether they are out of the tournament, and
  // whether they are at this table rather than another one — because that is
  // what the seat knows and the roster does not.
  return (roster || [])
    .filter((peer) => peer.user_id != null && peer.user_id !== myUserId)
    .filter((peer) => {
      const player = seated.get(peer.user_id);
      if (!player) return true;               // on the rail: the roster is enough
      return !player.is_eliminated && player.table_number === myTableNumber;
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
