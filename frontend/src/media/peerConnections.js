/** The live camera and microphone connections to the rest of the table.
 *
 * A singleton outside React, like `api/socket.js`, for the same reason: these
 * connections outlive any component and there must only ever be one set of
 * them. React tells it what the table looks like; it decides what to open and
 * what to close.
 *
 * Media flows browser to browser. The server is only the postbox the two sides
 * use to find each other.
 */

import { send } from "../api/socket";
import api from "../api/http";
import useMediaStore from "../store/mediaStore";
import { remember, stored, toRestore } from "./rejoinMedia";
import {
  AUDIO_BITRATE, ICE_SERVERS, MEDIA_CONSTRAINTS, bitrateTier, isPolite, permissionMessage,
} from "./mesh";

let myUserId = null;
// What the server says about relays, fetched once per page. Until it arrives,
// STUN alone — which is what this app used for its whole life and is right for
// most pairs.
let iceServers = ICE_SERVERS;
let hasRelay = false;
let iceAsked = null;
// Which table this is, so a camera remembered across a reload is only ever
// turned back on at the table it was on at. See rejoinMedia.js.
let tableKey = "";
let localStream = null;
// In-flight getUserMedia calls, by device, so a double mount asks once. By
// device and not one between them: keyed on nothing, turning the camera on
// while the microphone request was still in the air handed back the
// microphone's promise, added its track again and never asked for video at all.
const pendingMedia = new Map();
const peers = new Map();   // userId -> { pc, audioSender, videoSender, ... }

export function setMyUserId(userId) {
  myUserId = userId;
}

/**
 * Ask the server where the cameras should look for each other.
 *
 * Once per page, and nothing waits on it: a connection made before the answer
 * arrives uses STUN, which is what every connection used before this existed.
 * See backend/game/ice.py for why a relay is the difference between a player
 * on mobile data seeing the table and seeing nothing.
 */
export function loadIceServers() {
  iceAsked = iceAsked || api.get("/tournaments/ice/")
    .then(({ data }) => {
      if (Array.isArray(data.ice_servers) && data.ice_servers.length) {
        iceServers = data.ice_servers;
      }
      hasRelay = Boolean(data.relay);
      useMediaStore.getState().setLocal({ relay: hasRelay });
      return data;
    })
    .catch(() => null);
  return iceAsked;
}

export function setTableKey(key) {
  tableKey = String(key || "");
}

/**
 * Turn back on whatever this tab had on before it was reloaded.
 *
 * Only where the browser already says the permission is granted, so this can
 * never be the reason a permission dialogue appears — see rejoinMedia.js.
 */
export async function restoreFromReload(key) {
  const saved = stored();
  if (!saved) return false;
  let granted = false;
  try {
    // Both devices, because either could be the one that was on. Not every
    // browser implements the query; one that does not simply restores nothing,
    // which is where this started.
    const names = [];
    if (saved.cameraOn) names.push("camera");
    if (saved.micOn) names.push("microphone");
    const states = await Promise.all(
      names.map((name) => navigator.permissions.query({ name })),
    );
    granted = states.length > 0 && states.every((one) => one.state === "granted");
  } catch {
    return false;
  }
  const wanted = toRestore(saved, { table: String(key || ""), granted });
  if (!wanted) return false;
  await enable(wanted);
  return true;
}

function wanted() {
  const { cameraOn, micOn } = useMediaStore.getState();
  return { audio: micOn, video: cameraOn };
}

/** Hold exactly the devices that are switched on, and no others. */
export async function enable({ audio, video }) {
  if (!audio && !video) return disable();

  const store = useMediaStore.getState();
  store.setLocal({ permissionError: null, cameraOn: video, micOn: audio });
  localStream = localStream || new MediaStream();

  try {
    if (audio && !localStream.getAudioTracks().length) await acquire("audio");
    if (video && !localStream.getVideoTracks().length) await acquire("video");
  } catch (error) {
    const kind = error?.wantedKind;
    store.setLocal({
      permissionError: permissionMessage(error),
      // Only the device that was refused goes back off.
      ...(kind === "video" ? { cameraOn: false } : { micOn: false }),
    });
    if (kind === "video") video = false;
    if (kind === "audio") audio = false;
    if (!audio && !video) return disable();
  }

  // Switching a device off releases it. Merely muting the track leaves the
  // camera light on, and a light that stays on after you turned the camera off
  // is not something a player should have to trust us about.
  if (!audio) stopTracks(localStream.getAudioTracks());
  if (!video) stopTracks(localStream.getVideoTracks());

  peers.forEach((peer) => attachLocalTracks(peer));
  store.setLocal({ cameraOn: video, micOn: audio, localStream });
  announce({ audio, video });
  // For the length of this tab only, so a reload comes back with the camera it
  // had a second ago — see rejoinMedia.js for why that is not the same as
  // remembering it between sessions.
  remember({ table: tableKey, cameraOn: video, micOn: audio });
}

async function acquire(kind) {
  // Ask only for the device being switched on: fewer prompts, and no claim on
  // a camera somebody only wanted to listen through.
  const request = { [kind]: MEDIA_CONSTRAINTS[kind] };
  if (!pendingMedia.has(kind)) {
    pendingMedia.set(kind, navigator.mediaDevices.getUserMedia(request));
  }
  try {
    const stream = await pendingMedia.get(kind);
    stream.getTracks().forEach((track) => {
      // The device can be taken back by the operating system or another app.
      // Without this we would sit there transmitting a black rectangle.
      track.onended = () => enable({ ...wanted(), [kind]: false });
      localStream.addTrack(track);
    });
  } catch (error) {
    error.wantedKind = kind;
    throw error;
  } finally {
    pendingMedia.delete(kind);
  }
}

function stopTracks(tracks) {
  tracks.forEach((track) => {
    track.onended = null;
    track.stop();
    localStream.removeTrack(track);
  });
}

/** Stop transmitting entirely and release the devices. */
export function disable() {
  const store = useMediaStore.getState();
  if (localStream) {
    stopTracks(localStream.getTracks());
    localStream = null;
  }
  peers.forEach((peer) => closePeer(peer));
  peers.clear();
  store.setLocal({ cameraOn: false, micOn: false, localStream: null });
  store.clearPeers();
  announce({ audio: false, video: false });
  // Turned off on purpose is the one state worth remembering as itself: a
  // reload must not undo it.
  remember({ table: tableKey, cameraOn: false, micOn: false });
}

/** Release everything, for leaving the page. */
export function teardown() {
  disable();
  useMediaStore.getState().reset();
}

function announce({ audio, video }) {
  send({ type: "media_presence", audio, video });
}

/** Open and close connections so they match the table. This is the only place
 *  a connection is created or destroyed. */
export function reconcile(desired) {
  // You take part or you do not. Watching the table without being seen or heard
  // would make an invisible spectator of a player, and it also keeps both sides
  // of every connection agreeing on who should exist.
  const { audio, video } = wanted();
  if (!audio && !video) desired = [];

  const desiredIds = new Set(desired.map((peer) => peer.userId));

  peers.forEach((peer, userId) => {
    if (!desiredIds.has(userId)) {
      closePeer(peer);
      peers.delete(userId);
      useMediaStore.getState().dropPeer(userId);
    }
  });

  desired.forEach((peer) => {
    // Their name, whether or not they have a seat to read one off — a watcher
    // has none, and the strip along the bottom of the felt needs one.
    useMediaStore.getState().setPeer(peer.userId, {
      name: peer.name || "",
      watching: Boolean(peer.watching),
    });
    // Only one side opens the connection. When both did, both declared their own
    // audio and video up front, and resolving the collision left the exchange
    // carrying two of each: one live pair and one dead pair. A video element
    // plays the first video track it is given, which was the dead one — the
    // black rectangle people were seeing while being seen perfectly well
    // themselves. The other side waits for the offer instead.
    if (!peers.has(peer.userId) && !isPolite(myUserId, peer.userId)) {
      createPeer(peer.userId, { opensTheCall: true });
    }
    useMediaStore.getState().setPeer(peer.userId, { audio: peer.audio, video: peer.video });
  });

  // Reapply to everyone, not only the new arrival: a table that grew has to
  // shrink the streams that were already running.
  const tier = bitrateTier(peers.size);
  peers.forEach((peer) => applyBitrate(peer, tier));
}

function createPeer(userId, { opensTheCall } = {}) {
  const pc = new RTCPeerConnection({ iceServers });
  const peer = {
    pc,
    polite: isPolite(myUserId, userId),
    makingOffer: false,
    ignoreOffer: false,
    triedIceRestart: false,
    userId,
  };
  peers.set(userId, peer);
  useMediaStore.getState().setPeer(userId, { status: "connecting", stream: null });

  // The side that opens the call declares both directions once, in a fixed
  // order, so switching a camera on later is a track swap rather than a fresh
  // negotiation. The side that answers takes the shape from the offer, which is
  // what keeps the exchange to exactly one audio and one video track.
  if (opensTheCall) {
    peer.audioSender = pc.addTransceiver("audio", { direction: "sendrecv" }).sender;
    peer.videoSender = pc.addTransceiver("video", { direction: "sendrecv" }).sender;
    attachLocalTracks(peer);
  }

  pc.onnegotiationneeded = async () => {
    try {
      peer.makingOffer = true;
      await pc.setLocalDescription();
      signal(userId, { kind: "description", description: pc.localDescription });
    } catch {
      // A failed negotiation is this pair's problem; the state change below
      // reports it and the rest of the table carries on.
    } finally {
      peer.makingOffer = false;
    }
  };

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) signal(userId, { kind: "candidate", candidate: candidate.toJSON() });
  };

  pc.ontrack = ({ track }) => {
    if (track.kind === "video") {
      const report = () => useMediaStore.getState().setPeer(userId, { videoFlowing: !track.muted });
      track.addEventListener("mute", report);
      track.addEventListener("unmute", report);
      report();
    }
    // Tracks put in place with replaceTrack belong to no stream of their own,
    // so the event carries none and we have to collect them ourselves. Keeping
    // one stream per peer means the video element is attached once and the
    // second track simply joins it.
    if (!peer.remoteStream) peer.remoteStream = new MediaStream();
    // Replace rather than accumulate: a renegotiation can hand us a second
    // track of the same kind, and the element would play whichever came first.
    peer.remoteStream.getTracks()
      .filter((existing) => existing.kind === track.kind)
      .forEach((existing) => peer.remoteStream.removeTrack(existing));
    peer.remoteStream.addTrack(track);
    useMediaStore.getState().setPeer(userId, { stream: peer.remoteStream });
  };

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (state === "connected") {
      peer.triedIceRestart = false;
      useMediaStore.getState().setPeer(userId, { status: "connected" });
      return;
    }
    if (state === "failed") {
      // One restart is worth trying — a route can change mid-game. Beyond that,
      // with no relay to fall back on, retrying only burns battery.
      if (!peer.triedIceRestart) {
        peer.triedIceRestart = true;
        try { pc.restartIce(); } catch { /* nothing more to try */ }
        return;
      }
      useMediaStore.getState().setPeer(userId, { status: "failed" });
    }
  };

  return peer;
}

/** Take the senders the remote offer created and point them at our devices. */
function adoptTransceivers(peer) {
  peer.pc.getTransceivers().forEach((transceiver) => {
    const kind = transceiver.receiver?.track?.kind;
    if (kind === "audio") peer.audioSender = transceiver.sender;
    if (kind === "video") peer.videoSender = transceiver.sender;
    // The offer may only ask to receive; we want to be seen as well as to see.
    if (transceiver.direction === "recvonly") transceiver.direction = "sendrecv";
  });
  attachLocalTracks(peer);
}

function attachLocalTracks(peer) {
  const audioTrack = localStream?.getAudioTracks()[0] || null;
  const videoTrack = localStream?.getVideoTracks()[0] || null;
  peer.audioSender?.replaceTrack(audioTrack).catch(() => {});
  peer.videoSender?.replaceTrack(videoTrack).catch(() => {});
}

function applyBitrate(peer, tier) {
  setSenderLimit(peer.videoSender, tier);
  setSenderLimit(peer.audioSender, { maxBitrate: AUDIO_BITRATE });
}

function setSenderLimit(sender, limits) {
  if (!sender) return;
  const parameters = sender.getParameters();
  if (!parameters.encodings || parameters.encodings.length === 0) {
    parameters.encodings = [{}];
  }
  Object.assign(parameters.encodings[0], limits);
  sender.setParameters(parameters).catch(() => {});
}

function closePeer(peer) {
  peer.pc.onnegotiationneeded = null;
  peer.pc.onicecandidate = null;
  peer.pc.ontrack = null;
  peer.pc.onconnectionstatechange = null;
  peer.pc.close();
}

function signal(userId, payload) {
  send({ type: "media_signal", to_user_id: userId, signal: payload });
}

/** Handle an offer, answer or candidate that arrived for us.
 *
 * The collision handling is WebRTC's "perfect negotiation": when both sides
 * offer at once, the polite one abandons its own offer and takes theirs. Which
 * side is polite comes from the user ids, so both reach opposite conclusions
 * without asking each other.
 */
export async function handleSignal(fromUserId, payload) {
  const { audio, video } = wanted();
  if (!audio && !video) return;  // not taking part, so nothing to answer

  const peer = peers.get(fromUserId) || createPeer(fromUserId);
  const { pc } = peer;

  try {
    if (payload.kind === "description") {
      const description = payload.description;
      const collision = description.type === "offer"
        && (peer.makingOffer || pc.signalingState !== "stable");

      peer.ignoreOffer = !peer.polite && collision;
      if (peer.ignoreOffer) return;

      await pc.setRemoteDescription(description);
      if (description.type === "offer") {
        // The offer created our transceivers; adopt them so our own camera and
        // microphone travel back over the same pair.
        adoptTransceivers(peer);
        await pc.setLocalDescription();
        signal(fromUserId, { kind: "description", description: pc.localDescription });
      }
    } else if (payload.kind === "candidate") {
      try {
        await pc.addIceCandidate(payload.candidate);
      } catch (error) {
        // A candidate for an offer we deliberately dropped is expected.
        if (!peer.ignoreOffer) throw error;
      }
    }
  } catch {
    useMediaStore.getState().setPeer(fromUserId, { status: "failed" });
  }
}

/** Re-announce after a websocket reconnect.
 *
 * The server forgot us while we were away and told the table so, which means
 * every peer already closed their side. Rebuilding is the honest move; keeping
 * half-dead connections around is not.
 */
export function reannounce() {
  peers.forEach((peer) => closePeer(peer));
  peers.clear();
  useMediaStore.getState().clearPeers();

  const { audio, video } = wanted();
  if (audio || video) announce({ audio, video });
}
