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
import useMediaStore from "../store/mediaStore";
import {
  AUDIO_BITRATE, ICE_SERVERS, MEDIA_CONSTRAINTS, bitrateTier, isPolite, permissionMessage,
} from "./mesh";

let myUserId = null;
let localStream = null;
let pendingMedia = null;   // an in-flight getUserMedia, so a double mount asks once
const peers = new Map();   // userId -> { pc, audioSender, videoSender, ... }

export function setMyUserId(userId) {
  myUserId = userId;
}

function wanted() {
  const { cameraOn, micOn } = useMediaStore.getState();
  return { audio: micOn, video: cameraOn };
}

/** Hold exactly the devices that are switched on, and no others. */
export async function enable({ audio, video }) {
  if (!audio && !video) return disable();

  const store = useMediaStore.getState();
  store.setLocal({ permissionError: null });
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
}

async function acquire(kind) {
  // Ask only for the device being switched on: fewer prompts, and no claim on
  // a camera somebody only wanted to listen through.
  const request = { [kind]: MEDIA_CONSTRAINTS[kind] };
  pendingMedia = pendingMedia || navigator.mediaDevices.getUserMedia(request);
  try {
    const stream = await pendingMedia;
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
    pendingMedia = null;
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
    if (!peers.has(peer.userId)) createPeer(peer.userId);
    useMediaStore.getState().setPeer(peer.userId, { audio: peer.audio, video: peer.video });
  });

  // Reapply to everyone, not only the new arrival: a table that grew has to
  // shrink the streams that were already running.
  const tier = bitrateTier(peers.size);
  peers.forEach((peer) => applyBitrate(peer, tier));
}

function createPeer(userId) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
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

  // Both directions declared once, in a fixed order, so switching a camera on
  // later is a track swap rather than a fresh negotiation with every peer.
  peer.audioSender = pc.addTransceiver("audio", { direction: "sendrecv" }).sender;
  peer.videoSender = pc.addTransceiver("video", { direction: "sendrecv" }).sender;
  attachLocalTracks(peer);

  pc.onnegotiationneeded = async () => {
    // Chrome fires this again after an implicit rollback, when the exchange it
    // is asking about has already been settled by the answer.
    if (pc.signalingState !== "stable") return;
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

  pc.ontrack = ({ track, streams }) => {
    // Tracks put in place with replaceTrack belong to no stream of their own,
    // so the event carries none and we have to collect them ourselves. Keeping
    // one stream per peer means the video element is attached once and the
    // second track simply joins it.
    if (!peer.remoteStream) peer.remoteStream = streams[0] || new MediaStream();
    if (!streams[0]) peer.remoteStream.addTrack(track);
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
