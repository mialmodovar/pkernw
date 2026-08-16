import { useEffect, useState } from "react";

import useGameStore from "../../store/gameStore";
import { throwableFor, throwLift, throwPoint } from "./throwables";

// How long the thing is in the air, and how long the mess it leaves stays on
// screen after it lands. The whoosh and the splat in useTableSounds are timed
// to the first of these.
export const FLIGHT_MS = 620;
const SPLAT_MS = 520;

// Smoke, which is not thrown and does not land. Each puff hangs for a second
// after the one before it, so the whole path is still there when the last one
// arrives — that is the difference between smoke and a splat, and the only
// reason to draw it puff by puff rather than as one thing crossing.
const SMOKE_MS = 1000;
const PUFFS = 8;

/**
 * The cigar, lit where it was drawn, and the smoke it puts across the table.
 *
 * Nothing flies here, so there is no landing to wait for: every puff is laid
 * out at once along the arc anything else would take, each held back by how
 * long the smoke would have taken to reach it.
 */
function CigarSmoke({ item, dx, dy }) {
  return (
    <>
      <span
        className="animate-cigar-light block text-2xl leading-none"
        style={{ animationDuration: `${FLIGHT_MS + SMOKE_MS}ms` }}
      >
        {item.glyph}
      </span>
      {Array.from({ length: PUFFS }, (_, i) => {
        const t = (i + 1) / PUFFS;
        const at = throwPoint(dx, dy, t);
        return (
          <span
            key={i}
            className="absolute left-0 top-0 block"
            style={{ transform: `translate(${at.x}px, ${at.y}px)` }}
          >
            <span
              className="animate-smoke-puff block leading-none"
              // Thickening as it goes: the far end is a lungful arriving, the
              // near end what is left of it.
              style={{
                fontSize: `${1 + t * 0.85}rem`,
                animationDuration: `${SMOKE_MS}ms`,
                animationDelay: `${Math.round(t * FLIGHT_MS)}ms`,
              }}
            >
              {item.smoke}
            </span>
          </span>
        );
      })}
    </>
  );
}

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
  const smokes = Boolean(item.smoke);
  const life = FLIGHT_MS + (smokes ? SMOKE_MS : SPLAT_MS);

  useEffect(() => {
    const hit = setTimeout(() => setLanded(true), FLIGHT_MS);
    const gone = setTimeout(() => clearThrow(throwing.id), life);
    return () => { clearTimeout(hit); clearTimeout(gone); };
  }, [throwing.id, clearThrow, life]);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lift = throwLift(dx);
  const spin = dx >= 0 ? 540 : -540;

  return (
    <span
      className="pointer-events-none absolute z-40 select-none"
      style={{ left: from.x, top: from.y }}
    >
      {smokes ? (
        <CigarSmoke item={item} dx={dx} dy={dy} />
      ) : !landed ? (
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
