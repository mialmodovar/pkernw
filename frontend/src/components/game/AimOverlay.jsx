import { useRef, useState } from "react";

import { throwableFor } from "./throwables";

// How close the pointer has to be to a seat for that seat to be the target.
// Generous: you are throwing at a person, not clicking a checkbox.
const LOCK_RADIUS = 120;

/**
 * Aiming, as one layer over the whole table.
 *
 * The click used to be wired to each seat, and it kept not firing — the seat's
 * own handler lives on its nameplate, so a crosshair drawn around the whole
 * seat was mostly not clickable. One overlay owns the pointer instead: it hit
 * tests the seats itself, so what you can see you can hit.
 *
 * It draws the throw before it happens — a dashed line from your own face to
 * wherever you are pointing, and a ring on whoever it would land on. A click
 * with nobody under it puts the item down, which is the other thing a person
 * reaches for after picking one up by mistake.
 */
export default function AimOverlay({ item, hero, targets, onThrow, onCancel }) {
  const frame = useRef(null);
  const [pointer, setPointer] = useState(null);

  const locked = (() => {
    if (!pointer) return null;
    let best = null;
    for (const target of targets) {
      const distance = Math.hypot(target.x - pointer.x, target.y - pointer.y);
      if (distance <= LOCK_RADIUS && (!best || distance < best.distance)) {
        best = { ...target, distance };
      }
    }
    return best;
  })();

  const track = (event) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    setPointer({ x: event.clientX - box.left, y: event.clientY - box.top });
  };

  const release = () => {
    if (locked) onThrow(locked);
    else onCancel();
  };

  const glyph = throwableFor(item).glyph;
  const tip = locked || pointer;

  return (
    <div
      ref={frame}
      onMouseMove={track}
      onClick={release}
      // Touch has no hover, so a tap has to both aim and throw: the move
      // handler runs first and puts the pointer where the finger landed.
      onTouchMove={(event) => track(event.touches[0])}
      className="absolute inset-0 z-50 cursor-crosshair"
    >
      <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
        {hero && tip && (
          <line
            x1={hero.x} y1={hero.y} x2={tip.x} y2={tip.y}
            stroke={locked ? "var(--color-highlight)" : "var(--color-text-muted)"}
            strokeWidth={locked ? 2.5 : 1.5}
            strokeDasharray="9 7"
            strokeLinecap="round"
            className="animate-aim-line"
            opacity={locked ? 0.95 : 0.5}
          />
        )}
        {locked && (
          <>
            <circle
              cx={locked.x} cy={locked.y} r="46"
              fill="none" stroke="var(--color-highlight)" strokeWidth="2.5"
              strokeDasharray="10 8" className="animate-aim-ring"
            />
            <circle
              cx={locked.x} cy={locked.y} r="60"
              fill="rgb(var(--highlight-rgb) / 0.08)" stroke="none"
            />
          </>
        )}
      </svg>

      {/* What you are holding, on the end of the line. */}
      {pointer && (
        <span
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-2xl leading-none
                     drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)]"
          style={{ left: pointer.x, top: pointer.y }}
        >
          {glyph}
        </span>
      )}

      {locked && (
        <span
          className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded-full
                     text-[11px] font-bold bg-(--color-highlight) text-(--color-highlight-ink)
                     shadow-lg shadow-black/60"
          style={{ left: locked.x, top: locked.y + 52 }}
        >
          {locked.name}
        </span>
      )}
    </div>
  );
}
