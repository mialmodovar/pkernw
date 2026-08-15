/**
 * A blind structure from the two things a host actually knows: how long they
 * want to play, and how fast.
 *
 * Writing one by hand means picking a dozen pairs of numbers and hoping the
 * tournament ends near bedtime. The arithmetic that decides when it ends is not
 * complicated — it is the ratio between the chips in play and the blinds — so
 * it belongs in a function rather than in a host's head.
 */

export const SPEEDS = {
  normal: { label: "Normal", minutesPerLevel: 20 },
  turbo: { label: "Turbo", minutesPerLevel: 10 },
  hyper: { label: "Hyper", minutesPerLevel: 5 },
};

export const SPEED_NAMES = ["normal", "turbo", "hyper"];

// Blinds people can count out in chips: the leading digits a real structure
// uses, at every scale. 7s and 9s are not among them for a reason.
//
// The 10 is the next magnitude's 1, and it has to be in the list: without it
// anything from 8 upwards rounds back down to 8, so 96 became 80 rather than
// the 100 anybody would have written.
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

// Below this the small blind stops being half of anything.
const MIN_BIG_BLIND = 10;

/** The nearest blind a human would actually write down. */
export function niceBlind(value) {
  if (!Number.isFinite(value) || value <= 0) return MIN_BIG_BLIND;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const step = NICE_STEPS.reduce(
    (best, candidate) => (Math.abs(candidate - scaled) < Math.abs(best - scaled) ? candidate : best),
    NICE_STEPS[0],
  );
  // Rounded to something a small blind can halve exactly.
  return Math.max(MIN_BIG_BLIND, Math.round((step * magnitude) / 2) * 2);
}

/**
 * A tournament is over when the blinds have eaten the chips.
 *
 * The last level is sized so the average stack is worth a handful of big
 * blinds — past that nobody is playing poker, they are shoving — which is what
 * makes the structure land near the duration asked for rather than merely
 * having the right number of levels in it.
 */
const ENDING_BIG_BLINDS = 12;

/**
 * Build one.
 *
 * Timed rather than counted in hands, because a duration is what was asked for
 * and a hand count cannot answer that question honestly — how long a hand takes
 * depends on the table.
 */
export function buildBlindStructure({
  minutes = 120,
  speed = "normal",
  startingChips = 10000,
  players = 9,
} = {}) {
  const { minutesPerLevel } = SPEEDS[speed] || SPEEDS.normal;
  // Four levels is the fewest that is a structure rather than a ramp; the
  // duration wins over the speed when the two disagree, since it is the one
  // the host actually cares about.
  const levelCount = Math.max(4, Math.round(minutes / minutesPerLevel));

  // A hundred big blinds to start with, which is what a full stack means.
  const firstBig = niceBlind(Math.max(startingChips, 1) / 100);
  const chipsInPlay = Math.max(startingChips, 1) * Math.max(players, 2);
  const lastBig = Math.max(firstBig * 2, niceBlind(chipsInPlay / ENDING_BIG_BLINDS));

  // Geometric, so each level is the same step up as the last — a structure
  // that climbs evenly is one players can feel coming.
  const growth = levelCount > 1 ? (lastBig / firstBig) ** (1 / (levelCount - 1)) : 1;

  const levels = [];
  let previousBig = 0;
  for (let index = 0; index < levelCount; index += 1) {
    // Never sideways: rounding to nice numbers can otherwise repeat a level,
    // which reads as a mistake in the structure.
    const bigBlind = Math.max(niceBlind(firstBig * growth ** index), previousBig + 2);
    previousBig = bigBlind;
    levels.push({
      is_break: false,
      small_blind: Math.round(bigBlind / 2),
      big_blind: bigBlind,
      // No ante on the first level — the opening level is for playing poker,
      // not for paying for the privilege.
      ante: index === 0 ? 0 : Math.max(1, Math.round(bigBlind / 8)),
      duration_minutes: minutesPerLevel,
      duration_hands: null,
    });
  }
  return levels;
}

/** How long the structure below it actually runs, breaks included. */
export function structureMinutes(levels) {
  return (levels || []).reduce((total, level) => total + (level.duration_minutes || 0), 0);
}

/** "2h 30m", or "45m" — the way a host says it out loud. */
export function formatDuration(minutes) {
  if (!minutes) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
