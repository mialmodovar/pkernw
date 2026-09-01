import { claimableCount } from "./missions";

/**
 * What the collapsed strip is allowed to say without being opened.
 *
 * One rule, written down once because six buttons will otherwise each invent
 * their own: a NUMBER for money you can collect, a DOT for a person waiting on
 * you. Money is countable and the count changes what you do — two missions
 * finished is a different errand from one. A person waiting is not a quantity
 * anybody acts on differently; it is a yes-or-no, and the bell in the header
 * forty pixels above is already showing that count. Two numbers for one fact,
 * disagreeing by a second's lag, is worse than one number and a dot.
 *
 * Both of these are counted off state the app already holds — the mission
 * board, and the inbox the bell fetches — so a badge costs no request. Anything
 * that would need its own fetch does not get a badge until it has a store.
 */

/**
 * How many missions have coins sitting in them.
 *
 * A re-export with a name from the strip's own vocabulary, so PanelStrip has
 * one import for its badges instead of one per panel — and so the day Calotes
 * or Stats earns a badge, it is added beside this rather than wired straight
 * into the markup.
 */
export function missionsWaiting(missions) {
  return claimableCount(missions);
}

/**
 * How many people have asked to be your friend and not been answered.
 *
 * The inbox carries invitations as well, and those are not this panel's
 * business: a tournament invite is answered on the tournament's own page, so a
 * dot on Friends pointing at it would send somebody to the wrong panel. Today
 * the backend only ever sends friend requests, which is precisely why the
 * filter is here — the first invitation kind it adds must not light this up.
 */
export function friendAsks(items) {
  return (items || []).filter((one) => one.kind === "friend_request").length;
}
