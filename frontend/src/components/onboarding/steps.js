/**
 * What a new player is walked through, and in what order.
 *
 * Registering used to be a username, a password and a table colour, which left
 * somebody standing in an empty lobby with nothing to play and nobody to play
 * it with. The rest of these steps are the things that make the app worth
 * opening a second time — and every one of them can be skipped, because the
 * only step that is actually required is the first.
 *
 * Pure, so the order and the copy can be tested without mounting anything.
 */

export const STEPS = [
  {
    key: "account",
    title: "Make an account",
    // The first step is the account itself; there is nothing to skip past.
    skippable: false,
  },
  {
    key: "recovery",
    title: "Your recovery code",
    // Skippable in the sense that you can move on — but the code is shown once,
    // so the button says so.
    skippable: false,
  },
  { key: "clubs", title: "Join a club", skippable: true },
  { key: "friends", title: "Find your friends", skippable: true },
  { key: "modes", title: "What you can play", skippable: false },
];

export const STEP_KEYS = STEPS.map((step) => step.key);

/** Where a key sits in the walk, or -1 for one that is not part of it. */
export function stepIndex(key) {
  return STEP_KEYS.indexOf(key);
}

/** The step after this one, or null at the end of the walk. */
export function nextStep(key) {
  const index = stepIndex(key);
  if (index < 0 || index >= STEPS.length - 1) return null;
  return STEPS[index + 1].key;
}

/**
 * How far along somebody is, for the dots at the top.
 *
 * One-based and clamped, so a key that is not a step reads as the beginning
 * rather than as nowhere.
 */
export function progress(key) {
  const index = stepIndex(key);
  return { current: Math.max(1, index + 1), total: STEPS.length };
}

/** The step's own heading. */
export function stepTitle(key) {
  return STEPS[stepIndex(key)]?.title || "";
}

/** Whether this step offers a way past it without doing anything. */
export function canSkip(key) {
  return Boolean(STEPS[stepIndex(key)]?.skippable);
}
