import { useEffect, useRef } from "react";
import { playTick, playTimeBankWarning, playTimeExpired } from "./sounds";
import { useActionCountdown } from "./useActionCountdown";
import useGameStore from "../../store/gameStore";

// How close to the end of the regular clock the ticking starts.
const NEAR_END_SECONDS = 5;

/**
 * The sound of a clock running out: ticking through the last few seconds of
 * your regular time, a warning as it gives way to the time bank, ticking on
 * through the bank, and a final note when that reaches zero.
 *
 * The ticking rule is one rule, not two — near the end, or in the bank. That
 * matters because a tournament with no time bank configured has no bank to tick
 * through, and the last seconds of the regular clock are the only warning there
 * is going to be.
 *
 * Only ever for the hero. Everyone at the table is on a clock at some point, and
 * a cue for each of them would only train you to ignore the one that is yours.
 *
 * The ticking is driven by the countdown's own value rather than by a timer of
 * its own, so it cannot drift away from the number on screen: one tick per
 * second, in step with the digit changing, stopping dead when the clock does.
 */
export function useTimeoutAlert(isMyTurn, soundEnabled) {
  const { active, inTimeBank, remaining, displaySeconds } = useActionCountdown();
  const startedAt = useGameStore((s) => s.actionStartedAt);
  const warned = useRef(false);
  const finished = useRef(false);
  const tickedAt = useRef(null);
  const armedFor = useRef(null);

  useEffect(() => {
    // Every cue is re-armed by a fresh clock rather than by the turn ending.
    // A new decision can arrive while the previous one is still on screen — a
    // reconnect re-issues the request mid-turn — and keying this on the turn
    // going quiet would leave the cues spent for the whole of the next one.
    if (armedFor.current !== startedAt) {
      armedFor.current = startedAt;
      warned.current = false;
      finished.current = false;
      tickedAt.current = null;
    }

    if (!isMyTurn || !active) return;

    // Running down the last of the regular clock, or anywhere inside the bank.
    const ticking = remaining > 0 && (
      inTimeBank || (displaySeconds != null && displaySeconds <= NEAR_END_SECONDS)
    );

    if (inTimeBank && !warned.current) {
      warned.current = true;
      tickedAt.current = remaining;   // the warning stands in for this second's tick
      if (soundEnabled) playTimeBankWarning();
    } else if (ticking && tickedAt.current !== remaining) {
      // Guarded by the second it belongs to: this effect also runs for reasons
      // that have nothing to do with the clock, and each second gets one tick.
      // Keyed on the whole turn's `remaining`, so the tick-tock keeps its
      // alternation across the hand-over into the bank.
      tickedAt.current = remaining;
      if (soundEnabled) playTick(remaining % 2 === 0);
    }

    if (remaining === 0 && !finished.current) {
      finished.current = true;
      if (soundEnabled) playTimeExpired();
    }
  }, [isMyTurn, active, startedAt, inTimeBank, remaining, displaySeconds, soundEnabled]);
}
