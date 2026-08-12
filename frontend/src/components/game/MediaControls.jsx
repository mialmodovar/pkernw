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
      className={`w-7 h-7 rounded-full border text-xs flex items-center justify-center transition-colors ${
        on
          ? "border-[#c9a227] bg-[#3d2f0b] text-[#e6d9a8]"
          : "border-(--color-border) bg-black/40 opacity-45 grayscale hover:opacity-80 hover:border-(--color-border-strong)"
      }`}
    >
      {icon}
    </button>
  );
}

/** Turning your own camera and microphone on.
 *
 * What you are sending shows at your own seat, with everyone else's. Both start
 * off on every visit and nothing is remembered between sessions: at a poker
 * table, a microphone you forgot was on leaks more than a bad tell.
 */
export default function MediaControls() {
  const { cameraOn, micOn, permissionError } = useMediaStore();

  const toggle = (patch) => {
    const next = { audio: micOn, video: cameraOn, ...patch };
    if (!next.audio && !next.video) disable();
    else enable(next);
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-1.5">
        {/* The same glyph either way, dimmed when off: two different symbols
            made it a puzzle which state you were looking at. */}
        <ToggleButton on={cameraOn} label={cameraOn ? "Turn camera off" : "Turn camera on"}
          icon={"\u{1F4F9}"} onClick={() => toggle({ video: !cameraOn })} />
        <ToggleButton on={micOn} label={micOn ? "Turn microphone off" : "Turn microphone on"}
          icon={"\u{1F3A4}"} onClick={() => toggle({ audio: !micOn })} />
      </div>
      {permissionError && (
        <p className="text-[10px] text-[#c76b7a] max-w-[7rem] leading-tight">{permissionError}</p>
      )}
    </div>
  );
}
