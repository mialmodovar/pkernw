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
  const announced = new Map(roster.map((peer) => [peer.user_id, peer]));

  return players
    .filter((player) => player.user_id != null && player.user_id !== myUserId)
    .filter((player) => !player.is_eliminated)
    .filter((player) => player.table_number === myTableNumber)
    .filter((player) => announced.has(player.user_id))
    .map((player) => ({
      userId: player.user_id,
      name: player.name,
      ...announced.get(player.user_id),
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

// Public STUN only. Without a relay some pairs behind strict NAT will never
// connect; that is a per-pair failure the interface has to show, not hide.
export const ICE_SERVERS = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

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
