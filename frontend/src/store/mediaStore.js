import { create } from "zustand";

/** What the table needs to draw of the cameras and microphones.
 *
 * Deliberately separate from the game store: that one is reset on every mount
 * of the game page and rebuilt from server snapshots, while a live camera has
 * to survive those. Keeping them apart also guarantees the media layer can
 * never delay or corrupt the game state.
 */
const useMediaStore = create((set) => ({
  // My own devices. Never restored from a previous session — a camera that
  // turns itself on tomorrow is the kind of surprise nobody forgives. A reload
  // of this tab is a different matter and is restored; see media/rejoinMedia.js
  // for the line between the two.
  cameraOn: false,
  micOn: false,
  localStream: null,
  permissionError: null,
  // Whether this installation has a relay for the pairs that need one. Off
  // until the server says otherwise — see backend/game/ice.py.
  relay: false,

  // { [userId]: { stream, status, audio, video } } — status is "connecting",
  // "connected" or "failed", straight from the connection itself.
  peers: {},

  setLocal: (patch) => set(patch),

  setPeer: (userId, patch) => set((state) => ({
    peers: { ...state.peers, [userId]: { ...state.peers[userId], ...patch } },
  })),

  dropPeer: (userId) => set((state) => {
    const peers = { ...state.peers };
    delete peers[userId];
    return { peers };
  }),

  clearPeers: () => set({ peers: {} }),

  reset: () => set({
    cameraOn: false, micOn: false, localStream: null, permissionError: null, peers: {},
  }),
}));

export default useMediaStore;
