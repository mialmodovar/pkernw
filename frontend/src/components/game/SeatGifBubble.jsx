import { useEffect } from "react";

import { gifPreviewUrl } from "../../api/giphy";
import useGameStore from "../../store/gameStore";

/** Long enough to land a joke, short enough not to hide the table. */
const SHOW_MS = 7000;

/**
 * A GIF said in chat, over the seat of whoever said it.
 *
 * Chat is a panel you may have collapsed, so a GIF sent to it can go entirely
 * unseen — which defeats the point of sending one. This puts it where the
 * reaction belongs: on the player it came from.
 *
 * It clears itself. The store deliberately holds no timers, so the thing on
 * screen is the thing that decides when it is done.
 */
export default function SeatGifBubble({ userId, name }) {
  const bubble = useGameStore((s) => (userId == null ? null : s.gifBubbles[userId]));
  const clearGifBubble = useGameStore((s) => s.clearGifBubble);
  const bubbleId = bubble?.id ?? null;

  useEffect(() => {
    if (bubbleId == null) return undefined;
    const timer = setTimeout(() => clearGifBubble(userId, bubbleId), SHOW_MS);
    return () => clearTimeout(timer);
    // Keyed on the id, so a second GIF from the same player restarts the clock
    // rather than inheriting what was left of the first one's.
  }, [bubbleId, userId, clearGifBubble]);

  if (!bubble) return null;

  return (
    <div
      className="animate-gif-pop pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-30
                 rounded-md overflow-hidden border border-(--color-border-strong) shadow-lg shadow-black/60
                 bg-black/60"
    >
      <img
        src={gifPreviewUrl(bubble.gifId)}
        alt={`${name} sent a GIF`}
        className="block w-[clamp(3.5rem,11cqw,6rem)] h-auto"
      />
    </div>
  );
}
