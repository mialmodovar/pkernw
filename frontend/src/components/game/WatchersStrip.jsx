import Avatar from "../Avatar";
import useAuthStore from "../../store/authStore";
import useGameStore from "../../store/gameStore";
import useMediaStore from "../../store/mediaStore";
import SeatVideo from "./SeatVideo";

/**
 * The rail: whoever is watching this table, on camera, off the felt.
 *
 * They have no seat, so there is nowhere on the ring to draw them — and drawing
 * them nowhere is what made watching a one-way mirror. A row along the bottom
 * corner, the same circle a seat uses, small: they are at the table without
 * being in the hand and the picture should say so.
 *
 * Only the ones with a camera on. Somebody watching with theirs off has nothing
 * to draw and is nobody's business.
 */
export default function WatchersStrip({ compact }) {
  const peers = useMediaStore((s) => s.peers);
  const players = useGameStore((s) => s.players);
  const myUserId = useAuthStore((s) => s.user?.id ?? null);

  const seated = new Set(
    (players || []).map((player) => player.user_id).filter((id) => id != null),
  );
  const watchers = Object.entries(peers || {})
    .map(([userId, peer]) => ({ userId: Number(userId), peer }))
    // Anybody in the mesh who is not in a seat at this table is on the rail.
    .filter(({ userId, peer }) => !seated.has(userId) && userId !== myUserId && peer?.stream);

  if (watchers.length === 0) return null;

  return (
    <div className={`absolute z-10 flex items-center gap-1.5 ${
      compact ? "bottom-1 left-2" : "bottom-2 left-3"
    }`}>
      <span className="text-[9px] uppercase tracking-wider text-(--color-text-muted)">
        Watching
      </span>
      {watchers.map(({ userId, peer }) => (
        <span
          key={userId}
          title={`${peer.name || "Watching"} — at the rail`}
          className={`relative block rounded-full overflow-hidden
                      border border-(--color-border-strong) shadow shadow-black/60
                      ${compact ? "w-7 h-7" : "w-9 h-9"}`}
        >
          {/* The same element a seat uses, so a watcher's camera behaves like
              everybody else's — including falling back to their face when the
              picture is not getting through. */}
          <Avatar name={peer.name || "?"} className="w-full h-full" emojiClassName="text-sm" />
          <span className="absolute inset-0">
            <SeatVideo peer={peer} name={peer.name || "Watching"} />
          </span>
        </span>
      ))}
    </div>
  );
}
