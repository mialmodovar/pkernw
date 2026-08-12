import { useEffect, useRef } from "react";
import useMediaStore from "../../store/mediaStore";
import { disable, enable } from "../../media/peerConnections";

function ToggleButton({ on, label, icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={`w-9 h-9 rounded-full border text-sm flex items-center justify-center transition-colors ${
        on
          ? "border-[#c9a227] bg-[#3d2f0b] text-[#e6d9a8]"
          : "border-(--color-border) bg-black/40 text-(--color-text-muted) hover:text-(--color-silver)"
      }`}
    >
      {icon}
    </button>
  );
}

/** Turning your own camera and microphone on, and seeing what you are sending.
 *
 * Both start off on every visit and nothing is remembered between sessions: at
 * a poker table, a microphone you forgot was on leaks more than a bad tell.
 */
export default function MediaControls() {
  const { cameraOn, micOn, localStream, permissionError } = useMediaStore();
  const preview = useRef(null);

  useEffect(() => {
    const element = preview.current;
    if (!element || element.srcObject === localStream) return;
    element.srcObject = localStream;
    if (localStream) element.play().catch(() => {});
  }, [localStream, cameraOn]);

  const toggle = (patch) => {
    const next = { audio: micOn, video: cameraOn, ...patch };
    if (!next.audio && !next.video) disable();
    else enable(next);
  };

  return (
    <div className="flex items-center gap-2">
      {cameraOn && (
        <div className="w-20 aspect-[4/3] rounded-md overflow-hidden border border-(--color-border) bg-black/60">
          {/* Mirrored, because a self view that moves the wrong way is
              disorienting, and muted, or the room howls. */}
          <video ref={preview} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <ToggleButton on={cameraOn} label={cameraOn ? "Turn camera off" : "Turn camera on"}
          icon={cameraOn ? "\u{1F4F9}" : "\u{1F6AB}"} onClick={() => toggle({ video: !cameraOn })} />
        <ToggleButton on={micOn} label={micOn ? "Turn microphone off" : "Turn microphone on"}
          icon={micOn ? "\u{1F3A4}" : "\u{1F507}"} onClick={() => toggle({ audio: !micOn })} />
      </div>
      {permissionError && (
        <p className="text-[11px] text-[#c76b7a] max-w-[10rem] leading-tight">{permissionError}</p>
      )}
    </div>
  );
}
