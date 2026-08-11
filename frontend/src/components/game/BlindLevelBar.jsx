import { useState, useEffect } from "react";
import useGameStore from "../../store/gameStore";

export default function BlindLevelBar() {
  const level = useGameStore((s) => s.level);
  const isPaused = useGameStore((s) => s.isPaused);
  const showBB = useGameStore((s) => s.showBB);
  const toggleBB = useGameStore((s) => s.toggleBB);
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
      <div className="panel px-4 py-2 flex items-center justify-between text-sm">
        <span className="text-(--color-text-muted)">Waiting for level info...</span>
        <button
          onClick={toggleBB}
          className={`px-2 py-0.5 rounded text-xs font-semibold ${showBB ? "bg-[linear-gradient(135deg,#d4af37,#8a6c18)] text-[#1a1208] border border-[#e0c66b]" : "btn-secondary"}`}
        >
          {showBB ? "BB" : "Chips"}
        </button>
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
    <div className="panel px-4 py-2 flex items-center justify-between text-sm">
      <span className="text-(--color-silver)">
        {isBreak
          ? `Break after level ${level.blind_level_number || 0}`
          : `Level ${level.blind_level_number || 1} - SB ${level.small_blind} / BB ${level.big_blind}`}
        {!isBreak && level.ante > 0 && <> / Ante {level.ante}</>}
      </span>
      <div className="flex items-center gap-3">
        <button
          onClick={toggleBB}
          className={`px-2 py-0.5 rounded text-xs font-semibold ${showBB ? "bg-[linear-gradient(135deg,#d4af37,#8a6c18)] text-[#1a1208] border border-[#e0c66b]" : "btn-secondary"}`}
        >
          {showBB ? "BB" : "Chips"}
        </button>
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
