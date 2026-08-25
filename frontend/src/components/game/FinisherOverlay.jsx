import { useEffect, useState } from "react";

import { gifFullUrl, gifOriginalUrl } from "../../api/giphy";
import useGameStore from "../../store/gameStore";
import { playFinisherSound } from "./sounds";

/** Long enough for a GIF to land, short enough that the next hand is not held
 *  hostage to it. The table waits three seconds between hands anyway. */
const PLAY_MS = 4000;

/** The river decides the hand, and covering it the instant it lands takes that
 *  away from everyone at the table. The GIF waits its turn. */
const AFTER_RIVER_MS = 2000;

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
  const riverShownAt = useGameStore((s) => s.riverShownAt);
  const clearFinisher = useGameStore((s) => s.clearFinisher);
  const soundEnabled = useGameStore((s) => s.soundEnabled);
  const finisherId = finisher?.id ?? null;
  // Held apart from `finisher` so the sound effect below depends on the list
  // itself: it is the same object for as long as one knockout is on screen.
  const players = finisher?.players ?? null;
  // Which finisher has waited out the river. Null until it has, so the hold is
  // never skipped by a render that happens in the middle of it.
  const [readyId, setReadyId] = useState(null);

  useEffect(() => {
    if (finisherId == null) {
      setReadyId(null);
      return undefined;
    }
    // Counted from the river rather than from the knockout: a hand that ended
    // on an earlier street has nothing to wait for.
    const wait = riverShownAt
      ? Math.max(0, AFTER_RIVER_MS - (Date.now() - riverShownAt))
      : 0;
    if (wait === 0) {
      setReadyId(finisherId);
      return undefined;
    }
    const timer = setTimeout(() => setReadyId(finisherId), wait);
    return () => clearTimeout(timer);
  }, [finisherId, riverShownAt]);

  useEffect(() => {
    if (readyId == null) return undefined;
    const timer = setTimeout(() => clearFinisher(readyId), PLAY_MS);
    return () => clearTimeout(timer);
  }, [readyId, clearFinisher]);

  // The sting goes with the picture, not with the knockout: it fires when the
  // GIF actually appears, after the wait for the river. A split pot plays both
  // players' sounds, which is loud and correct — they both did it. Muting the
  // table mutes this too; it is the loudest thing the table does.
  useEffect(() => {
    if (readyId == null || !soundEnabled || !players) return;
    for (const one of players) playFinisherSound(one.sound);
  }, [readyId, players, soundEnabled]);

  if (!finisher || readyId !== finisherId) return null;

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
      {/* Two GIFs when two players share the knockout, side by side and each
          narrower, so a split pot still fits across the felt.

          Sized in container widths rather than percentages. A percentage width
          resolves against this row, and the row is a flex item that shrinks to
          fit its contents — so the image asked to be a fraction of a box whose
          size was its own, and collapsed to almost nothing. Everything else on
          the felt is measured in cqw against the table for the same reason. */}
      <div className="flex items-start justify-center gap-2 w-full px-4">
        {finisher.players.map((one, index) => (
          <img
            key={`${one.gifId}-${index}`}
            src={gifFullUrl(one.gifId)}
            alt=""
            // Not every GIF has a downsized rendition. One that does not falls
            // back to the original rather than showing nothing — a knockout
            // with no clip is the one thing this overlay must not be.
            onError={(event) => {
              const image = event.currentTarget;
              if (image.dataset.fellBack) return;
              image.dataset.fellBack = "1";
              image.src = gifOriginalUrl(one.gifId);
            }}
            // The height cap is in cqw too, not cqh: the table is a container
            // sized on its inline axis, so cqh is not available to it. The
            // frame holds a 5:3 aspect, which makes 22cqw about a third of its
            // height — enough to keep the GIF clear of the board below it.
            className={`${
              finisher.players.length > 1
                ? "max-w-[clamp(4.5rem,26cqw,13rem)] max-h-[18cqw]"
                : "max-w-[clamp(7rem,40cqw,22rem)] max-h-[22cqw]"
            } w-auto h-auto rounded-lg border-2 border-(--color-highlight)
              shadow-2xl shadow-black/70`}
          />
        ))}
      </div>
      <span
        className="px-3 py-1 rounded-full text-xs font-extrabold whitespace-nowrap
                   bg-[linear-gradient(135deg,var(--color-highlight-bright),var(--color-highlight-deep))]
                   text-(--color-highlight-ink) border border-(--color-highlight-deeper) shadow-lg shadow-black/60"
      >
        {finisher.players.map((one) => one.name).join(" & ")} knocked out {finisher.victimName}
      </span>
    </div>
  );
}
