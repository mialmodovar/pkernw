import { useEffect, useState } from "react";

import useGameStore from "../../store/gameStore";
import { throwableFor, throwLift } from "./throwables";

// How long the thing is in the air, and how long the mess it leaves stays on
// screen after it lands. The whoosh and the splat in useTableSounds are timed
// to the first of these.
export const FLIGHT_MS = 620;
const SPLAT_MS = 520;

/**
 * One object, mid-flight.
 *
 * Two nested elements rather than one: the outer carries it across at a
 * constant speed, the inner lifts and drops it. Composed, that is an arc —
 * which is what a thrown thing does and what a single translate cannot say. It
 * spins on the way, faster the further it has to go.
 *
 * Positioned by the caller, which is the only thing that knows where seats are.
 */
export default function ThrownItem({ throwing, from, to }) {
  const clearThrow = useGameStore((s) => s.clearThrow);
  const [landed, setLanded] = useState(false);
  const item = throwableFor(throwing.item);

  useEffect(() => {
    const hit = setTimeout(() => setLanded(true), FLIGHT_MS);
    const gone = setTimeout(() => clearThrow(throwing.id), FLIGHT_MS + SPLAT_MS);
    return () => { clearTimeout(hit); clearTimeout(gone); };
  }, [throwing.id, clearThrow]);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lift = throwLift(dx);
  const spin = dx >= 0 ? 540 : -540;

  return (
    <span
      className="pointer-events-none absolute z-40 select-none"
      style={{ left: from.x, top: from.y }}
    >
      {!landed ? (
        <span
          className="animate-throw-across block"
          style={{ "--throw-dx": `${dx}px`, animationDuration: `${FLIGHT_MS}ms` }}
        >
          <span
            className="animate-throw-arc block text-2xl leading-none"
            style={{
              "--throw-dy": `${dy}px`,
              "--throw-lift": `${lift}px`,
              "--throw-spin": `${spin}deg`,
              animationDuration: `${FLIGHT_MS}ms`,
            }}
          >
            {item.glyph}
          </span>
        </span>
      ) : (
        // The mess, where it landed. The travel is on the wrapper and the
        // bloom on the child: one element cannot carry both, since the
        // animation would overwrite the transform that puts it on the target.
        <span className="block" style={{ transform: `translate(${dx}px, ${dy}px)` }}>
          <span
            className="animate-throw-splat block text-3xl leading-none"
            style={{ animationDuration: `${SPLAT_MS}ms` }}
          >
            {item.splat}
          </span>
        </span>
      )}
    </span>
  );
}
