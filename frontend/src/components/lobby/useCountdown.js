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

/**
 * How long until a moment, in seconds, ticking as it goes.
 *
 * Same idea as the countdown above, from the other end: the server sends when
 * something starts and the answer people want is how long that is. Kept in an
 * effect rather than worked out while rendering, because the clock is not a
 * pure function of anything — read during a render it makes the render depend
 * on when it happened.
 */
export function useSecondsUntil(when) {
  const [left, setLeft] = useState(null);

  useEffect(() => {
    if (!when) {
      setLeft(null);
      return undefined;
    }
    const at = new Date(when).getTime();
    if (Number.isNaN(at)) {
      setLeft(null);
      return undefined;
    }
    const read = () => setLeft(Math.round((at - Date.now()) / 1000));
    read();
    // Every ten seconds: the answer is shown to the minute, so a second-by-
    // second tick would be six times the work for the same words.
    const id = setInterval(read, 10_000);
    return () => clearInterval(id);
  }, [when]);

  return left;
}
