import { useEffect } from "react";

import { gifPreviewUrl } from "../../api/giphy";
import useGameStore from "../../store/gameStore";
import { isEmojiMessage } from "./emojiMessage";

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
 * It rises from the face — the avatar on the left of the seat — because that is
 * who is talking. Anchored to the seat's left edge with its tail over the middle
 * of the picture, so every player's words come out of the same place: theirs.
 * One bubble per player, the newest thing they said replacing the last rather
 * than stacking up over their cards.
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
    <div className="animate-seat-bubble pointer-events-none absolute bottom-full left-0 mb-2 z-30 origin-bottom-left">
      {/* Never narrower than the tail has to reach: a two-letter "gg" is a
          smaller box than half an avatar is wide, and the arrow ended up out
          past the corner of the bubble it belongs to. */}
      <div
        style={{ minWidth: "calc(var(--seat-avatar) / 2 + 1.25rem)" }}
        className="relative rounded-lg border border-(--color-border-strong) bg-(--color-surface-raised)
                   shadow-lg shadow-black/60 overflow-hidden"
      >
        {isGif ? (
          <img
            src={gifPreviewUrl(bubble.gifId)}
            alt={`${name} sent a GIF`}
            className="block w-[clamp(3.5rem,11cqw,6rem)] h-auto"
          />
        ) : (
          <p className={`px-2 py-1 max-w-[11rem] w-max leading-snug text-(--color-silver) break-words ${
            // A reaction is the whole message, and at eleven pixels a thumbs-up
            // is the size of a full stop. Sized off the table like everything
            // else on the felt, so it grows with the seats rather than swamping
            // them on a phone.
            isEmojiMessage(bubble.text)
              ? "text-[clamp(1.1rem,3.4cqw,2rem)] leading-none text-center"
              : "text-[11px]"
          }`}>
            {bubble.text}
          </p>
        )}
      </div>
      {/* The tail, over the middle of the avatar below it — the seat sets
          --seat-avatar, so this follows whatever size the face is at. Drawn as
          a turned square with only its two outer edges bordered, so it reads as
          part of the bubble rather than a diamond stuck under it.

          The min() is the belt to the min-width's braces: whichever way a
          bubble ends up narrower than half an avatar, the tail stops at its
          edge rather than floating off the corner. */}
      <span
        aria-hidden="true"
        style={{ left: "min(calc(var(--seat-avatar) / 2), calc(100% - 0.875rem))" }}
        className="absolute -bottom-1 -translate-x-1/2 w-2 h-2 rotate-45 bg-(--color-surface-raised)
                   border-r border-b border-(--color-border-strong)"
      />
    </div>
  );
}
