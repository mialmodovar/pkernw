import { useEffect, useState } from "react";

const REVEAL_INTERVAL_MS = 700;

/**
 * Walks the showdown list one player at a time so hands turn over in sequence
 * instead of all appearing at once. Returns the set of seats revealed so far,
 * and null while there is no showdown (meaning "show whatever you normally
 * would").
 */
export function useShowdownReveal(showdown) {
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    if (!showdown || !showdown.length) {
      setRevealedCount(0);
      return undefined;
    }
    setRevealedCount(1);
    if (showdown.length === 1) return undefined;

    const id = setInterval(() => {
      setRevealedCount((prev) => {
        if (prev >= showdown.length) {
          clearInterval(id);
          return prev;
        }
        return prev + 1;
      });
    }, REVEAL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [showdown]);

  if (!showdown || !showdown.length) return null;
  return new Set(showdown.slice(0, revealedCount).map((entry) => entry.seat));
}
