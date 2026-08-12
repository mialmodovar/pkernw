import { useEffect, useRef } from "react";
import { onMessage } from "../api/socket";
import useAuthStore from "../store/authStore";
import useGameStore from "../store/gameStore";
import { desiredPeers } from "./mesh";
import { handleSignal, reannounce, reconcile, setMyUserId, teardown } from "./peerConnections";

/** Keeps the camera connections in step with who is sitting at the table.
 *
 * The table changes for reasons that have nothing to do with media — a player
 * busts, the tournament rebalances, a socket drops. Rather than a handler for
 * each, everything funnels into one question: who should I be connected to
 * now? The answer is recomputed on every change and the connections follow.
 */
export default function useTableMedia() {
  const myUserId = useAuthStore((state) => state.user?.id ?? null);
  const players = useGameStore((state) => state.players);
  const myTableNumber = useGameStore((state) => state.currentTableNumber);
  const connectionStatus = useGameStore((state) => state.connectionStatus);

  // Who has announced media, straight from the server. A ref rather than state
  // because it is an input to reconciliation, not something the page draws.
  const roster = useRef([]);
  const wasConnected = useRef(false);

  useEffect(() => { setMyUserId(myUserId); }, [myUserId]);

  useEffect(() => onMessage((message) => {
    switch (message.type) {
      case "media_roster":
        roster.current = message.peers;
        break;
      case "media_presence":
        if (message.user_id === myUserId) break;
        roster.current = [
          ...roster.current.filter((peer) => peer.user_id !== message.user_id),
          { user_id: message.user_id, audio: message.audio, video: message.video },
        ];
        break;
      case "media_left":
        roster.current = roster.current.filter((peer) => peer.user_id !== message.user_id);
        break;
      case "media_signal":
        handleSignal(message.from_user_id, message.signal);
        return;
      default:
        return;
    }
    reconcile(desiredPeers(
      useGameStore.getState().players,
      roster.current,
      myUserId,
      useGameStore.getState().currentTableNumber,
    ));
  }), [myUserId]);

  // The roster changed above; here it is the table itself that moved.
  useEffect(() => {
    reconcile(desiredPeers(players, roster.current, myUserId, myTableNumber));
  }, [players, myTableNumber, myUserId]);

  // While we were disconnected the server forgot our presence and told the
  // table, so every peer has already hung up. Start again rather than nurse
  // connections whose other end is gone.
  useEffect(() => {
    const isConnected = connectionStatus === "open";
    if (isConnected && wasConnected.current === false) {
      roster.current = [];
      reannounce();
    }
    wasConnected.current = isConnected;
  }, [connectionStatus]);

  // Leaving the page has to release the devices — a camera light left on after
  // the game is the complaint nobody forgets. pagehide covers the cases where
  // the cleanup below never runs, which is most of mobile.
  useEffect(() => {
    const release = () => teardown();
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      release();
    };
  }, []);
}
