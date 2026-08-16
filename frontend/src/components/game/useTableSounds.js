import { useEffect } from "react";
import { onMessage } from "../../api/socket";
import { playAction, playAllInTension, playSplat, playThrow } from "./sounds";

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
        case "action_taken":
          return playAction({ action: message.action, isAllIn: message.is_all_in });
        // The runout. This arrives before each street of an all-in, which is
        // exactly the beat worth scoring — the money is in and the cards are
        // about to say who has it.
        case "all_in_equity":
          return playAllInTension();
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
