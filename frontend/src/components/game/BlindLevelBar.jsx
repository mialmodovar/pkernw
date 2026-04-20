import { useState, useEffect } from "react";
import useGameStore from "../../store/gameStore";

export default function BlindLevelBar() {
  const level = useGameStore((s) => s.level);
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
      setRemaining((prev) => (prev != null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [level]);

  if (!level) {
    return (
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between text-sm">
        <span className="text-gray-500">Waiting for level info...</span>
        <button
          onClick={toggleBB}
          className={`px-2 py-0.5 rounded text-xs font-semibold ${showBB ? "bg-yellow-600 text-black" : "bg-gray-700 text-gray-300"}`}
        >
          {showBB ? "BB" : "Chips"}
        </button>
      </div>
    );
  }

  const isTimed = level.duration_minutes != null;

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="bg-gray-800 px-4 py-2 flex items-center justify-between text-sm">
      <span>
        Level {(level.level_index || 0) + 1} &mdash;{" "}
        SB {level.small_blind} / BB {level.big_blind}
        {level.ante > 0 && <> / Ante {level.ante}</>}
      </span>
      <div className="flex items-center gap-3">
        <button
          onClick={toggleBB}
          className={`px-2 py-0.5 rounded text-xs font-semibold ${showBB ? "bg-yellow-600 text-black" : "bg-gray-700 text-gray-300"}`}
        >
          {showBB ? "BB" : "Chips"}
        </button>
        <span className="text-gray-500">
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
