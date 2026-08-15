const formatTime = (secs) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

/**
 * Breaks used to stop play with no explanation at all — the table simply went
 * quiet, unlike a pause, which has always had an overlay. This says what is
 * happening, how long is left, and what the blinds will be when play resumes.
 */
export default function BreakOverlay({ level, nextLevel }) {
  if (!level?.is_break) return null;

  const remaining = level.remaining_seconds;

  return (
    <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center z-20">
      <p className="text-xs uppercase tracking-[0.2em] text-(--color-text-muted)">Break</p>
      <div className="text-4xl font-bold text-(--color-silver) mt-2">
        {remaining != null ? formatTime(remaining) : `${level.duration_minutes ?? "—"}:00`}
      </div>
      <p className="text-(--color-text-muted) text-sm mt-3">
        Play resumes automatically. Your seat is kept.
      </p>
      {nextLevel && !nextLevel.is_break && (
        <p className="mt-4 text-sm text-(--color-highlight-text)">
          Next: {nextLevel.small_blind}/{nextLevel.big_blind}
          {nextLevel.ante ? ` (ante ${nextLevel.ante})` : ""}
        </p>
      )}
    </div>
  );
}
