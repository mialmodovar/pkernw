import { useState, useEffect } from "react";
import useGameStore from "../../store/gameStore";
import useAuthStore from "../../store/authStore";

// Chips/BB display and the turn-cue sound switch. Both preferences persist.
function UserChip() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  return (
    <span className="flex items-center gap-1.5 pr-2 mr-1 border-r border-(--color-border)">
      <span className="text-base leading-none">{user.profile?.avatar_emoji || "\u{1F0CF}"}</span>
      <span className="hidden md:inline text-xs font-semibold text-(--color-silver)">{user.username}</span>
    </span>
  );
}

function DisplayToggles() {
  const showBB = useGameStore((s) => s.showBB);
  const toggleBB = useGameStore((s) => s.toggleBB);
  const soundEnabled = useGameStore((s) => s.soundEnabled);
  const toggleSound = useGameStore((s) => s.toggleSound);

  return (
    <div className="flex items-center gap-2">
      <UserChip />
      <span className="hidden md:inline text-xs text-(--color-text-muted)">Show</span>
      <div className="flex rounded overflow-hidden border border-(--color-border)">
        {[["Chips", false], ["BB", true]].map(([label, value]) => (
          <button
            key={label}
            onClick={() => { if (showBB !== value) toggleBB(); }}
            className={`px-2 py-0.5 text-xs font-semibold transition-colors ${
              showBB === value
                ? "bg-[linear-gradient(135deg,#d4af37,#8a6c18)] text-[#1a1208]"
                : "text-(--color-text-muted) hover:text-(--color-silver)"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        onClick={toggleSound}
        title={soundEnabled ? "Turn alert sound on (click to mute)" : "Turn alert sound muted"}
        aria-label={soundEnabled ? "Mute turn alert" : "Unmute turn alert"}
        className="btn-secondary px-2 py-0.5 rounded text-xs font-semibold transition-colors"
      >
        {soundEnabled ? "\u{1F509}" : "\u{1F507}"}
        <span className="hidden md:inline">{soundEnabled ? " Sound" : " Muted"}</span>
      </button>
    </div>
  );
}

export default function BlindLevelBar() {
  const level = useGameStore((s) => s.level);
  const isPaused = useGameStore((s) => s.isPaused);
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (!level || !level.remaining_seconds) {
      setRemaining(null);
      return;
    }
    setRemaining(level.remaining_seconds);
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (isPaused) return prev;
        return prev != null && prev > 0 ? prev - 1 : 0;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused, level]);

  if (!level) {
    return (
      <div className="panel px-2 md:px-4 py-1.5 md:py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs md:text-sm">
        <span className="text-(--color-text-muted)">Waiting for level info...</span>
        <DisplayToggles />
      </div>
    );
  }

  const isTimed = level.duration_minutes != null;
  const isBreak = Boolean(level.is_break);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="panel px-2 md:px-4 py-1.5 md:py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs md:text-sm">
      <span className="text-(--color-silver)">
        {isBreak
          ? `Break after level ${level.blind_level_number || 0}`
          : `Level ${level.blind_level_number || 1} - SB ${level.small_blind} / BB ${level.big_blind}`}
        {!isBreak && level.ante > 0 && <> / Ante {level.ante}</>}
      </span>
      <div className="flex items-center gap-2 md:gap-3 ml-auto">
        <DisplayToggles />
        <span className="text-(--color-text-muted)">
          {isTimed
            ? remaining != null
              ? formatTime(remaining)
              : `${level.duration_minutes}:00`
            : `Hand ${level.hands_in_level || 0} / ${level.duration_hands}`}
        </span>
      </div>
    </div>
  );
}
