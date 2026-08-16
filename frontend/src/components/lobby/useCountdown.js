import { useEffect, useState } from "react";

/**
 * A server-sent number of seconds, ticking down between refreshes.
 *
 * The late-registration deadline arrives on a REST poll every few seconds. Left
 * as it came it would sit still and then jump, which reads as broken; counted
 * down locally from each reading it behaves like the clock it is, and every
 * refresh quietly corrects any drift.
 */
export function useCountdown(seconds) {
  const [left, setLeft] = useState(seconds ?? null);

  useEffect(() => {
    if (seconds == null) {
      setLeft(null);
      return undefined;
    }
    const readAt = Date.now();
    setLeft(seconds);
    const id = setInterval(() => {
      setLeft(Math.max(0, Math.round(seconds - (Date.now() - readAt) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [seconds]);

  return left;
}
