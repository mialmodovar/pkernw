import { useEffect } from "react";
import { onMessage } from "../../api/socket";
import { playAction } from "./sounds";

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
      if (message.type !== "action_taken") return;
      playAction({ action: message.action, isAllIn: message.is_all_in });
    });
  }, [enabled]);
}
