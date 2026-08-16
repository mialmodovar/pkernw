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

/**
 * Which seats a runout has already turned face up.
 *
 * An all-in runout shows every hand in it before the flop and leaves them up
 * for the rest of the board. Those hands must be left alone by the stagger
 * below — see holdFaceDown.
 */
export function faceUpFromRunout(allInEquity) {
  return new Set((allInEquity || []).map((entry) => entry.seat));
}

/**
 * Should this seat's cards be held face down while the showdown turns over?
 *
 * Only if they were face down to begin with. Two players all in on the river
 * have been looking at each other's cards for three streets, and staggering
 * them again flipped the second hand back down for the length of one interval
 * before showing it a second time — which read as the loser's cards blinking.
 */
export function holdFaceDown({ seat, revealedSeats, faceUpSeats, isMe }) {
  if (revealedSeats == null || isMe) return false;
  if (faceUpSeats && faceUpSeats.has(seat)) return false;
  return !revealedSeats.has(seat);
}

/**
 * Is the result safe to show — the winner banner, the gold ring on the best
 * five? Held back until every hand has turned over, so nothing gives it away
 * mid-reveal. A runout has nothing left to give away.
 */
export function resultIsRevealed({ showdown, revealedSeats, faceUpSeats }) {
  if (revealedSeats == null) return true;
  if (revealedSeats.size >= (showdown?.length ?? 0)) return true;
  return Boolean(showdown?.length) && showdown.every((entry) => faceUpSeats?.has(entry.seat));
}
