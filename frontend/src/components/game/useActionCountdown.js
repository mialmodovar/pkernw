import { useEffect, useRef, useState } from "react";
import useGameStore from "../../store/gameStore";

const DEFAULT_ACTION_SECONDS = 20; // matches coordinator.py's action_timer_seconds

/**
 * Ticks down the current actor's clock, split into the regular clock and the
 * time bank. `action_required` is broadcast to the whole table, so this works
 * for any seat — the action panel and the per-seat ring share it so the two
 * can't drift apart.
 */
export function useActionCountdown() {
  const actionOnSeat = useGameStore((s) => s.actionOnSeat);
  const ctx = useGameStore((s) => s.actionContext);
  const isPaused = useGameStore((s) => s.isPaused);

  const total = ctx?.timer_sec ?? DEFAULT_ACTION_SECONDS;
  const base = ctx?.action_timer_sec ?? total;
  const bank = Math.max(0, total - base);

  const [remaining, setRemaining] = useState(null);
  const pausedRef = useRef(isPaused);

  useEffect(() => { pausedRef.current = isPaused; }, [isPaused]);

  useEffect(() => {
    if (actionOnSeat === null || !ctx) {
      setRemaining(null);
      return undefined;
    }
    setRemaining(total);
    const id = setInterval(() => {
      setRemaining((prev) => {
        if (pausedRef.current) return prev;
        return prev != null && prev > 0 ? prev - 1 : 0;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [actionOnSeat, ctx, total]);

  if (remaining == null) {
    return { active: false, remaining: null, displaySeconds: null, pct: 100, inTimeBank: false };
  }

  // The regular clock burns first; only then does the bank start draining.
  const inTimeBank = bank > 0 && remaining <= bank;
  const displaySeconds = inTimeBank ? remaining : remaining - bank;
  const phaseTotal = inTimeBank ? bank : base;
  const pct = phaseTotal > 0 ? (displaySeconds / phaseTotal) * 100 : 0;

  return { active: true, remaining, displaySeconds, pct, inTimeBank };
}
