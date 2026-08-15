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
