import { useCallback, useRef, useState } from "react";

/** One player's camera, on the outer edge of their seat.
 *
 * Rendered only when there is something to show, so a table where nobody uses a
 * camera looks exactly as it did before.
 */
export default function SeatVideo({ peer, name, mirrored = false, muted = false, bare = false }) {
  const element = useRef(null);
  const [needsGesture, setNeedsGesture] = useState(false);
  const stream = peer?.stream || null;

  // A callback ref, not an effect. This component swaps between <audio>, <video>
  // and a notice as the peer's state changes, and an effect keyed on the stream
  // does not run again when only the ELEMENT changed — which left a freshly
  // mounted <video> with no source at all, playing nothing, black. A callback
  // ref fires for whatever element is mounted right now.
  const attach = useCallback((node) => {
    element.current = node;
    if (!node || !stream) return;
    if (node.srcObject !== stream) node.srcObject = stream;
    // Browsers can still refuse to start playback. That must not break the
    // render — offer a tap instead.
    node.play().then(() => setNeedsGesture(false)).catch(() => setNeedsGesture(true));
  }, [stream]);

  if (!peer) return null;

  if (peer.status === "failed") {
    return <Notice>No video connection</Notice>;
  }

  // Audio arrives on the same stream. It is played by a hidden element so that
  // someone with only a microphone on still gets heard without taking up space.
  if (!peer.video) {
    return peer.stream ? <audio ref={attach} autoPlay playsInline className="hidden" /> : null;
  }

  // Their camera is on and the connection says it is up, but no video is
  // arriving. Saying so beats a black rectangle that everyone reads as a broken
  // camera — it is the connection between the two of you, not their webcam.
  if (peer.videoFlowing === false) {
    return <Notice>No picture getting through</Notice>;
  }

  // `bare` is the crowded-table form: just the picture, sized by whatever holds
  // it, with no frame of its own.
  if (bare) {
    return (
      <video ref={attach} autoPlay playsInline muted={muted}
        className={`w-full h-full object-cover ${mirrored ? "scale-x-[-1]" : ""}`} />
    );
  }

  return (
    <div className="w-full aspect-video max-h-[7.2cqw] mx-auto rounded-lg overflow-hidden border border-(--color-border)
                    bg-black/60 relative">
      <video ref={attach} autoPlay playsInline muted={muted}
        className={`w-full h-full object-cover ${mirrored ? "scale-x-[-1]" : ""}`} />
      {peer.status === "connecting" && (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-(--color-text-muted)">
          connecting…
        </span>
      )}
      {needsGesture && (
        <button
          onClick={() => element.current?.play().then(() => setNeedsGesture(false)).catch(() => {})}
          className="absolute inset-0 bg-black/70 text-[10px] text-(--color-silver)"
        >
          play {name}
        </button>
      )}
    </div>
  );
}

function Notice({ children }) {
  return (
    <div className="w-full aspect-video rounded-lg border border-(--color-border) bg-black/50
                    flex items-center justify-center px-1">
      <span className="text-[10px] text-(--color-text-muted) text-center leading-tight">
        {children}
      </span>
    </div>
  );
}
