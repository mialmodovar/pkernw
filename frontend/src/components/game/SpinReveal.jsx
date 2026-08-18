import { useEffect, useState } from "react";

import { MULTIPLIER_LADDER } from "./spinPrize";

/**
 * The draw, opening a Spin n Go.
 *
 * The multiplier was decided by the server the moment the third player sat down,
 * so nothing here is deciding anything — this is the wheel being turned over in
 * front of the people it already happened to. Which is the point of the format:
 * the prize is the first thing that happens, before a card is dealt, and three
 * players who just paid the same buy-in find out together whether they are
 * playing for double or for a hundred times it.
 *
 * The reel runs for a moment and then lands. Told instantly it is a number on a
 * screen; drawn, it is worth the second and a half.
 */
const REEL_MS = 1300;

export default function SpinReveal({ spin }) {
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    if (!spin?.multiplier) return undefined;
    const timer = setTimeout(() => setLanded(true), REEL_MS);
    return () => clearTimeout(timer);
  }, [spin?.multiplier]);

  if (!spin?.multiplier) return null;

  return (
    <div className="flex flex-col items-center">
      <div className="text-(--color-text-muted) text-sm tracking-[0.2em] uppercase mb-2">
        Spin n Go · {"\u{1FA99}"} {spin.stake_coins} each
      </div>

      {/* A window onto the ladder of multipliers, scrolling past too fast to
          read, until it stops on the one that was drawn. */}
      <div className="h-20 w-40 overflow-hidden rounded-xl border
                      border-[rgb(var(--highlight-rgb)/0.45)]
                      bg-[rgba(12,7,18,0.8)] flex items-center justify-center">
        {landed ? (
          <div className="animate-spin-land text-5xl font-bold tabular-nums
                          text-(--color-highlight-text)">
            {spin.multiplier}×
          </div>
        ) : (
          <div className="animate-spin-reel flex flex-col items-center">
            {/* Twice through, so the loop has somewhere to scroll to. */}
            {[...MULTIPLIER_LADDER, ...MULTIPLIER_LADDER].map((one, index) => (
              <div key={index} className="h-20 flex items-center text-5xl font-bold
                                          tabular-nums text-(--color-text-muted)">
                {one}×
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`mt-3 text-lg font-semibold tabular-nums transition-opacity duration-500 ${
        landed ? "opacity-100 text-(--color-highlight-text)" : "opacity-0"
      }`}>
        {"\u{1FA99}"} {spin.prize_coins.toLocaleString()} · winner takes all
      </div>
    </div>
  );
}
