import { useEffect, useState } from "react";
import useGameStore from "../../store/gameStore";

const DEFAULT_ACTION_SECONDS = 20; // matches coordinator.py's action_timer_seconds
const TICK_MS = 250;

/** What colour a clock is, wherever it is drawn.
 *
 * The seat ring and the action panel are the same clock seen from two places,
 * so the decision lives here rather than in each of them — they used to
 * disagree, with the ring still calmly gold while the panel had gone red.
 */
export function timerToneClass(countdown) {
  if (countdown.inTimeBank) return "bg-[#8a1c2b]";
  if (countdown.displaySeconds != null && countdown.displaySeconds <= 3) return "bg-[#b3243a]";
  return "bg-[#c9a227]";
}

/**
 * Ticks down the current actor's clock, split into the regular clock and the
 * time bank. `action_required` is broadcast to the whole table, so this works
 * for any seat — the action panel and the per-seat ring share it so the two
 * can't drift apart.
 *
 * The remaining time is DERIVED from when the clock started rather than held in
 * each caller's own state. Every instance therefore agrees, and one that mounts
 * part way through a turn — a collapsed panel being expanded, a seat appearing
 * after a rebalance, a reconnect — shows the time that is actually left instead
 * of starting again from the top.
 */
export function useActionCountdown() {
  const actionOnSeat = useGameStore((s) => s.actionOnSeat);
  const ctx = useGameStore((s) => s.actionContext);
  const startedAt = useGameStore((s) => s.actionStartedAt);
  const pausedSince = useGameStore((s) => s.pausedSince);

  const total = ctx?.timer_sec ?? DEFAULT_ACTION_SECONDS;
  const base = ctx?.action_timer_sec ?? total;
  const bank = Math.max(0, total - base);
  const running = actionOnSeat !== null && Boolean(ctx) && Boolean(startedAt);

  // Read in an effect rather than during render: the wall clock is not
  // something a render may look at. The first read happens immediately on
  // mount, which is what makes a panel opened mid-turn correct.
  const [remaining, setRemaining] = useState(null);
  useEffect(() => {
    if (!running) {
      setRemaining(null);
      return undefined;
    }
    const read = () => {
      // A paused table's clock stands still, so time spent paused doesn't count.
      const now = Date.now();
      const frozenFor = pausedSince ? now - pausedSince : 0;
      const elapsed = Math.max(0, (now - startedAt - frozenFor) / 1000);
      setRemaining(Math.max(0, Math.min(total, Math.ceil(total - elapsed))));
    };
    read();
    const id = setInterval(read, TICK_MS);
    return () => clearInterval(id);
  }, [running, startedAt, pausedSince, total]);

  if (!running || remaining == null) {
    return { active: false, remaining: null, displaySeconds: null, pct: 100, inTimeBank: false };
  }

  // The regular clock burns first; only then does the bank start draining.
  const inTimeBank = bank > 0 && remaining <= bank;
  const displaySeconds = inTimeBank ? remaining : remaining - bank;
  const phaseTotal = inTimeBank ? bank : base;
  const pct = phaseTotal > 0 ? (displaySeconds / phaseTotal) * 100 : 0;

  return { active: true, remaining, displaySeconds, pct, inTimeBank };
}
