import { useCallback, useRef, useState } from "react";

/** One player's camera, inside the circle their face goes in.
 *
 * The circle is the only place a camera is ever drawn. There used to be a
 * framed rectangle on the outer edge of the seat as well, for a camera that was
 * announced but not arriving yet — which meant switching a camera on made an
 * empty black box appear beside the seats for as long as the connection took to
 * come up, and then vanish. Nobody read that as "connecting"; they read it as
 * the layout breaking. So this draws a picture or it draws nothing, and the seat
 * keeps the face it already had until there are frames to put in its place.
 *
 * Audio rides on the same stream and still has to be played, so a peer who is
 * only on the microphone — or whose camera has not come through — gets a hidden
 * element instead of a picture. It takes up no space.
 */
export default function SeatVideo({ peer, name, mirrored = false, muted = false }) {
  const element = useRef(null);
  const [needsGesture, setNeedsGesture] = useState(false);
  const stream = peer?.stream || null;

  // A callback ref, not an effect. This component swaps between <audio> and
  // <video> as the peer's state changes, and an effect keyed on the stream does
  // not run again when only the ELEMENT changed — which left a freshly mounted
  // <video> with no source at all, playing nothing, black. A callback ref fires
  // for whatever element is mounted right now.
  const attach = useCallback((node) => {
    element.current = node;
    if (!node || !stream) return;
    if (node.srcObject !== stream) node.srcObject = stream;
    // Browsers can still refuse to start playback. That must not break the
    // render — offer a tap instead.
    node.play().then(() => setNeedsGesture(false)).catch(() => setNeedsGesture(true));
  }, [stream]);

  // Nothing has arrived down this connection yet. The avatar is still there and
  // stays there; there is nothing to draw over it.
  if (!stream) return null;

  // Whether there are frames worth putting in the circle. A failed connection, a
  // camera that is off, and a camera whose picture is not getting through all
  // come to the same thing here: keep the face that is already in the circle
  // rather than replace it with black.
  if (!peer.video || peer.videoFlowing === false || peer.status === "failed") {
    return <audio ref={attach} autoPlay playsInline muted={muted} className="hidden" />;
  }

  return (
    <>
      <video ref={attach} autoPlay playsInline muted={muted}
        className={`w-full h-full object-cover ${mirrored ? "scale-x-[-1]" : ""}`} />
      {needsGesture && (
        <button
          type="button"
          onClick={() => element.current?.play().then(() => setNeedsGesture(false)).catch(() => {})}
          className="absolute inset-0 bg-black/70 text-[9px] leading-tight text-(--color-silver)"
        >
          play {name}
        </button>
      )}
    </>
  );
}
