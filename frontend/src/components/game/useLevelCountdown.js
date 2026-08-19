import { useEffect, useState } from "react";
import useGameStore from "../../store/gameStore";

const TICK_MS = 250;

/**
 * Time left in the current blind level or break.
 *
 * Derived from when the server's reading was taken rather than counted down in
 * each caller's own state, for the same reason the action clock is: two places
 * draw this now — the top bar and the tournament info panel — and the panel is
 * mounted and unmounted every time it is opened. Counting locally would restart
 * the level at its full duration each time you looked at it.
 *
 * Returns null when there is no level yet, or when the level is not timed.
 */
export function useLevelCountdown() {
  const total = useGameStore((s) => s.level?.remaining_seconds ?? null);
  const clockAt = useGameStore((s) => s.levelClockAt);
  const pausedSince = useGameStore((s) => s.pausedSince);
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (total == null || !clockAt) {
      setRemaining(null);
      return undefined;
    }
    const read = () => {
      // A paused tournament's level clock stands still, as the table does.
      const now = Date.now();
      const frozenFor = pausedSince ? now - pausedSince : 0;
      const elapsed = Math.max(0, (now - clockAt - frozenFor) / 1000);
      setRemaining(Math.max(0, Math.min(total, Math.ceil(total - elapsed))));
    };
    read();
    const id = setInterval(read, TICK_MS);
    return () => clearInterval(id);
  }, [total, clockAt, pausedSince]);

  return remaining;
}

/** m:ss, the way both the bar and the panel want it. */
export function formatClock(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Blinds about to move, and worth catching the eye of somebody mid-decision. */
export const LEVEL_ENDING_SECONDS = 60;

/**
 * Whether the clock should read as urgent.
 *
 * Only a timed level can say this: a level counted in hands ends when the hand
 * ends, so there is no last minute to warn anybody about.
 */
export function levelIsEnding(level, remainingSeconds) {
  if (!level || level.duration_minutes == null) return false;
  if (remainingSeconds == null) return false;
  return remainingSeconds <= LEVEL_ENDING_SECONDS;
}

/**
 * How much of this level is left, however the level measures itself.
 *
 * A level counted in hands had no answer to this at all: the panel showed a
 * dash and the bar showed how many hands had been played, which is the one
 * number you can work out for yourself. What you actually want to know is the
 * same thing the clock tells you on a timed level — how long you have before
 * the blinds go up — so both kinds say that, in their own units.
 */
export function levelRemainingLabel(level, remainingSeconds) {
  if (!level) return null;

  if (level.duration_minutes != null) {
    return formatClock(remainingSeconds != null ? remainingSeconds : level.duration_minutes * 60);
  }

  const total = level.duration_hands;
  if (!total) return null;
  const left = Math.max(0, total - (level.hands_in_level || 0));
  if (left === 0) return "blinds up next";
  return left === 1 ? "last hand" : `${left} hands`;
}
