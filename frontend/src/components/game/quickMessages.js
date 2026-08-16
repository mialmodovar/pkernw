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

/** The faces. A reaction is a thing you make, not a thing you say, and half of
 *  what happens at a table is answered better by one of these than by any
 *  sentence — the beat where somebody rivers you and there is nothing to add.
 *
 *  Kept to twelve so the grid stays one glance wide. They travel as ordinary
 *  chat text and bubble over your face like anything else you say. */
export const REACTIONS = [
  "\u{1F44D}", "\u{1F602}", "\u{1F62E}", "\u{1F621}",
  "\u{1F92F}", "\u{1F64F}", "\u{1F525}", "\u{1F480}",
  "\u{1F91D}", "\u{1F340}", "\u{2764}\u{FE0F}", "\u{1F62D}",
];

/** Straight out, without touching any draft: a canned line is a thing you say
 *  instead of typing, not a thing you type into what you were already saying. */
export function sendQuickMessage(text) {
  return send({ type: "chat_message", text });
}
