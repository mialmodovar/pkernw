/**
 * Sharing Giphy's hourly allowance between several keys.
 *
 * A Giphy key is rated per hour — a hundred-odd reads, fewer searches — and one
 * key serves the whole app, so a table of players typing in the picker empties
 * it well before the hour is up and everybody gets nothing back. More keys is
 * the only lever Giphy gives you without paying, so the app takes a list of
 * them.
 *
 * Two jobs, and both matter. Requests go round the keys in turn, so the load
 * lands evenly instead of exhausting the first one and moving on; and a key that
 * comes back rate-limited is rested for the hour and skipped in the meantime,
 * because asking a spent key again is a wasted round trip that answers the same
 * way. When every key is resting, that is worth saying out loud rather than
 * showing an empty grid.
 *
 * Pure, with the clock passed in: "which key next" is arithmetic on a couple of
 * numbers, and it is the kind of arithmetic that is silently wrong for an hour
 * at a time.
 */

/** Giphy's window. A key that said no is no use again until it rolls over. */
export const COOLDOWN_MS = 60 * 60 * 1000;

/**
 * The keys out of one or more environment variables.
 *
 * Comma-separated, because that is what a deploy panel can hold in one field.
 * Blanks and repeats are dropped: an accidental trailing comma should not mean
 * an empty key in the rotation, and the same key twice would take two turns.
 */
export function parseKeys(...values) {
  const seen = [];
  for (const value of values) {
    for (const part of String(value ?? "").split(",")) {
      const key = part.trim();
      if (key && !seen.includes(key)) seen.push(key);
    }
  }
  return seen;
}

/**
 * A rotation over `keys`, nothing resting.
 *
 * `startAt` is where the first request goes. Every browser holds its own
 * rotation, so if they all started at the first key it would take the first hit
 * from every page load in the house — the spreading only works if they do not
 * all begin in the same place.
 */
export function newRotation(keys, startAt = 0) {
  return { keys, next: keys.length ? Math.abs(Math.trunc(startAt)) % keys.length : 0, resting: {} };
}

/** Whether this key is inside its cooldown at `now`. */
function isResting(rotation, key, now) {
  const until = rotation.resting[key];
  return until != null && until > now;
}

/**
 * The key to use, and the rotation to remember, or `key: null` when they are
 * all resting.
 *
 * Returned as a pair rather than mutating, so a caller cannot take a key
 * without advancing the turn — which would send every request to key one.
 */
export function takeKey(rotation, now) {
  const { keys } = rotation;
  for (let step = 0; step < keys.length; step += 1) {
    const index = (rotation.next + step) % keys.length;
    const key = keys[index];
    if (isResting(rotation, key, now)) continue;
    return { key, rotation: { ...rotation, next: (index + 1) % keys.length } };
  }
  return { key: null, rotation };
}

/** Put a key aside for the hour after `now`. */
export function restKey(rotation, key, now, cooldownMs = COOLDOWN_MS) {
  return { ...rotation, resting: { ...rotation.resting, [key]: now + cooldownMs } };
}

/** How many keys could answer a request right now. */
export function keysReady(rotation, now) {
  return rotation.keys.filter((key) => !isResting(rotation, key, now)).length;
}

/**
 * When the first resting key comes back, or null if none is still resting.
 *
 * The picker says how long the wait is, and "try again later" without a number
 * is what people ignore. Cooldowns that have already elapsed are ignored rather
 * than being the smallest number in the list — one from an hour ago would
 * otherwise report a wait of nothing while the others are still spent.
 */
export function restingUntil(rotation, now) {
  const times = Object.values(rotation.resting).filter((until) => until > now);
  return times.length ? Math.min(...times) : null;
}
