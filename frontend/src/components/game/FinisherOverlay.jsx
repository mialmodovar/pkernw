import { useEffect } from "react";

import { gifFullUrl } from "../../api/giphy";
import useGameStore from "../../store/gameStore";

/** Long enough for a GIF to land, short enough that the next hand is not held
 *  hostage to it. The table waits three seconds between hands anyway. */
const PLAY_MS = 4000;

/**
 * The knockout GIF, in the middle of the table.
 *
 * Only the player who did the knocking chose it, and only their table sees it.
 * It sits over the board rather than beside it because that is the moment
 * everyone is already looking at — and it clears itself, so nothing is left
 * covering the felt when the cards come out again.
 */
export default function FinisherOverlay() {
  const finisher = useGameStore((s) => s.finisher);
  const clearFinisher = useGameStore((s) => s.clearFinisher);
  const finisherId = finisher?.id ?? null;

  useEffect(() => {
    if (finisherId == null) return undefined;
    const timer = setTimeout(() => clearFinisher(finisherId), PLAY_MS);
    return () => clearTimeout(timer);
  }, [finisherId, clearFinisher]);

  if (!finisher) return null;

  return (
    <div
      // Lifted clear of the middle of the felt: the board sits dead centre, and
      // a GIF landing on top of it hides the one thing everybody is reading.
      className="animate-finisher pointer-events-none absolute inset-0 z-40
                 flex flex-col items-center justify-start pt-[6%] gap-2"
      // Announced rather than silent: a player using a screen reader should
      // still be told who knocked whom out, even though the GIF says nothing.
      role="status"
    >
      <img
        src={gifFullUrl(finisher.gifId)}
        alt=""
        className="max-w-[min(52%,18rem)] max-h-[40%] rounded-lg border-2 border-(--color-highlight)
                   shadow-2xl shadow-black/70"
      />
      <span
        className="px-3 py-1 rounded-full text-xs font-extrabold whitespace-nowrap
                   bg-[linear-gradient(135deg,var(--color-highlight-bright),var(--color-highlight-deep))]
                   text-(--color-highlight-ink) border border-(--color-highlight-deeper) shadow-lg shadow-black/60"
      >
        {finisher.name} knocked out {finisher.victimName}
      </span>
    </div>
  );
}
