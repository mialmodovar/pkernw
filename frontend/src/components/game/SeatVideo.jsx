import { useEffect, useRef, useState } from "react";

/** One player's camera, above or below their nameplate.
 *
 * Rendered only when there is something to show, so a table where nobody uses
 * a camera looks exactly as it did before.
 */
export default function SeatVideo({ peer, name }) {
  const ref = useRef(null);
  const [needsGesture, setNeedsGesture] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || !peer?.stream || element.srcObject === peer.stream) return;
    element.srcObject = peer.stream;
    // Browsers can still refuse to start playback. That must not break the
    // render — offer a tap instead.
    element.play().catch(() => setNeedsGesture(true));
  }, [peer?.stream]);

  if (!peer) return null;

  if (peer.status === "failed") {
    return (
      <div className="w-full aspect-video rounded-lg border border-(--color-border) bg-black/50
                      flex items-center justify-center px-1">
        <span className="text-[10px] text-(--color-text-muted) text-center leading-tight">
          No video connection
        </span>
      </div>
    );
  }

  // Audio arrives on the same stream. It is played by a hidden element so that
  // someone with only a microphone on still gets heard without taking up space.
  if (!peer.video) {
    return peer.stream ? <audio ref={ref} autoPlay playsInline className="hidden" /> : null;
  }

  return (
    <div className="w-full aspect-video rounded-lg overflow-hidden border border-(--color-border)
                    bg-black/60 relative">
      <video ref={ref} autoPlay playsInline className="w-full h-full object-cover" />
      {peer.status === "connecting" && (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-(--color-text-muted)">
          connecting…
        </span>
      )}
      {needsGesture && (
        <button
          onClick={() => ref.current?.play().then(() => setNeedsGesture(false)).catch(() => {})}
          className="absolute inset-0 bg-black/70 text-[10px] text-(--color-silver)"
        >
          play {name}
        </button>
      )}
    </div>
  );
}
