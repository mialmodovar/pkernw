import { useEffect } from "react";

import { gifPreviewUrl } from "../../api/giphy";
import useGameStore from "../../store/gameStore";

// A GIF is a joke and needs landing; a line of chat is read in a moment. Both
// short enough that the table is never wearing somebody's last word for long.
const GIF_MS = 7000;
const TEXT_MS = 5000;

/**
 * What somebody just said, over the seat they said it from.
 *
 * Chat is a panel you may well have folded away — it starts that way — so a
 * line sent to it can go entirely unseen, which is most of the point of saying
 * it. This puts it where talk at a table actually comes from: the player.
 *
 * It rises from the right-hand corner of the seat, which is where the hero's
 * own quick-message button sits, so your words come out of the button you said
 * them with. One bubble per player: the newest thing they said replaces the
 * last rather than stacking up over their cards.
 *
 * It clears itself. The store deliberately holds no timers, so the thing on
 * screen is the thing that decides when it is done.
 */
export default function SeatBubble({ userId, name }) {
  const bubble = useGameStore((s) => (userId == null ? null : s.seatBubbles[userId]));
  const clearSeatBubble = useGameStore((s) => s.clearSeatBubble);
  const bubbleId = bubble?.id ?? null;
  const isGif = Boolean(bubble?.gifId);

  useEffect(() => {
    if (bubbleId == null) return undefined;
    const timer = setTimeout(() => clearSeatBubble(userId, bubbleId), isGif ? GIF_MS : TEXT_MS);
    return () => clearTimeout(timer);
    // Keyed on the id, so a second message from the same player restarts the
    // clock rather than inheriting what was left of the first one's.
  }, [bubbleId, isGif, userId, clearSeatBubble]);

  if (!bubble) return null;

  return (
    <div className="animate-gif-pop pointer-events-none absolute bottom-full right-0 mb-2 z-30 origin-bottom-right">
      <div className="relative rounded-lg border border-(--color-border-strong) bg-(--color-surface-raised)
                      shadow-lg shadow-black/60 overflow-hidden">
        {isGif ? (
          <img
            src={gifPreviewUrl(bubble.gifId)}
            alt={`${name} sent a GIF`}
            className="block w-[clamp(3.5rem,11cqw,6rem)] h-auto"
          />
        ) : (
          <p className="px-2 py-1 max-w-[11rem] w-max text-[11px] leading-snug text-(--color-silver) break-words">
            {bubble.text}
          </p>
        )}
      </div>
      {/* The tail, pointing back down at where it came from. Drawn as a turned
          square with only the two outer edges bordered, so it reads as part of
          the bubble rather than a diamond stuck under it. */}
      <span
        aria-hidden="true"
        className="absolute -bottom-1 right-3 w-2 h-2 rotate-45 bg-(--color-surface-raised)
                   border-r border-b border-(--color-border-strong)"
      />
    </div>
  );
}
