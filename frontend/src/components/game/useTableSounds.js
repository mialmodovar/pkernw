import { useEffect } from "react";
import { onMessage } from "../../api/socket";
import { playAction, playSplat, playThrow } from "./sounds";

/** Gives every action at the table a sound.
 *
 * Listens to the socket directly rather than watching the store: an action is
 * an event, and two players betting the same amount in a row would look
 * identical in state. It also keeps sound out of the store, which has no
 * business knowing whether anyone is listening.
 */
export default function useTableSounds(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    return onMessage((message) => {
      switch (message.type) {
        // The heartbeat lives in here, on the all-in itself. It used to hang
        // off all_in_equity instead, which only arrives once somebody calls —
        // so the shove, the loudest thing a player can do, went out silent
        // whenever everyone folded to it.
        case "action_taken":
          return playAction({ action: message.action, isAllIn: message.is_all_in });
        case "item_thrown":
          playThrow();
          // Timed to the flight in ThrownItem: the splat belongs to the moment
          // it lands, not the moment it was thrown.
          window.setTimeout(playSplat, 620);
          return undefined;
        default:
          return undefined;
      }
    });
  }, [enabled]);
}
