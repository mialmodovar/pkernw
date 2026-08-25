/**
 * Where each decision sits, so that it never moves.
 *
 * The panel has two faces — waiting for the action, and holding it — and they
 * used to be laid out independently: four small pills in a row while you wait,
 * three large buttons somewhere else once it is your turn. So the thing under
 * the cursor changed the instant the turn arrived, and a click already on its
 * way landed on whatever had moved into that spot. At a table with a clock
 * running, that is somebody's tournament.
 *
 * There are three slots, always, in this order. A turn fills them; while you
 * wait they are drawn empty, and what you can pre-commit to sits in the line
 * above them:
 *
 *   fold        give it up
 *   passive     the cheapest way to stay in — check when it is free, call when
 *               it is not. One slot, because they are the same decision priced
 *               differently, and because the alternative is a row that changes
 *               width depending on whether anybody bet.
 *   aggressive  raise
 *
 * A slot with nothing in it is still drawn, empty, at its full size. That is the
 * point: the row is the same shape whether or not you can raise, so the Fold
 * button is in the same place this hand as it was last hand.
 */

export const SLOTS = ["fold", "passive", "aggressive"];

/**
 * What each slot holds when the decision is yours.
 *
 * `can` is the panel's own reading of the valid actions. Fold and check are
 * mutually exclusive there — the engine does not offer a fold when checking is
 * free — so the fold slot empties on a free check rather than offering to throw
 * a hand away for nothing.
 */
export function turnSlots(can = {}) {
  return [
    { slot: "fold", kind: can.fold ? "fold" : "empty" },
    { slot: "passive", kind: can.check ? "check" : can.call ? "call" : "empty" },
    { slot: "aggressive", kind: can.raise ? "raise" : "empty" },
  ];
}

/**
 * What each slot holds while you are waiting for it: nothing.
 *
 * Fold and Check used to be drawn here at full size, standing where the buttons
 * they anticipate would stand, with Check/Fold and Call any as small pills in
 * the line above. That split read as two classes of control for what is one
 * choice out of four — and the two big ones sat exactly where a live Fold or
 * Call lands a moment later, which is the one place a pre-selection should not
 * be. All four are pills in the line above now, in one row, in the order you
 * would say them; see PRESELECTS in ActionPanel.jsx.
 *
 * So the three slots wait empty and full-size. That is still the point of them:
 * the row keeps its shape, and there is nothing pressable under the cursor until
 * the decision is actually yours.
 */
export function waitingSlots() {
  return SLOTS.map((slot) => ({ slot, kind: "empty" }));
}

/**
 * Whether a cursor sitting still through the change of turn would find the same
 * kind of decision under it.
 *
 * This is the property the layout exists for, so it is checked rather than
 * assumed: a pre-selection and the button that replaces it have to mean the
 * same thing, or the layout has made the misclick easier rather than harder.
 */
export function slotsAgree(waiting, turn) {
  const agrees = { fold: ["fold", "empty"], check: ["check", "call", "empty"] };
  return waiting.every((cell, index) => {
    const other = turn[index];
    if (cell.slot !== other.slot) return false;
    if (cell.kind !== "preselect") return true;
    return agrees[cell.preselect].includes(other.kind);
  });
}

/**
 * What the raise button says.
 *
 * "All in" whenever the only raise on offer is the whole stack — which is every
 * decision in an All In or Fold game, and every decision anywhere by somebody
 * too short to raise by less. Printing "Raise 1,500" for a shove is technically
 * true and reads as a number to be chosen rather than the decision it is.
 */
export function raiseLabel(minRaise, maxRaise, amount, format = String) {
  return minRaise >= maxRaise ? "All in" : `Raise ${format(amount)}`;
}
