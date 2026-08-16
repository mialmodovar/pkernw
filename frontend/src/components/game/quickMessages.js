import { send } from "../../api/socket";

/** The things actually said at a table, one tap away.
 *
 * Short on purpose. Anything longer than this is worth typing, and a wall of
 * canned sentences is how a chat starts sounding like a vending machine — but
 * "nh" while you are still working out whether you were beaten is a message
 * nobody has time to type. The expansions are in the tooltips, since half of
 * these only read as words if you already play.
 *
 * Shared by the chat panel and the bar at the top of the table: the same eight
 * lines wherever you reach for them.
 */
export const QUICK_MESSAGES = [
  { text: "nh", hint: "Nice hand" },
  { text: "gg", hint: "Good game" },
  { text: "ty", hint: "Thank you" },
  { text: "gl", hint: "Good luck" },
  { text: "lol", hint: "Well then" },
  { text: "brutal", hint: "That was rough" },
  { text: "one time!", hint: "Come on, deck" },
  { text: "sorry", hint: "Sorry — for the suckout you just put on somebody" },
];

/** Straight out, without touching any draft: a canned line is a thing you say
 *  instead of typing, not a thing you type into what you were already saying. */
export function sendQuickMessage(text) {
  return send({ type: "chat_message", text });
}
