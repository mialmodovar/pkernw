import { useEffect } from "react";

import useGameStore from "../../store/gameStore";
import ChipStack from "./ChipStack";

// How long the money takes to cross the felt. A collection has to be finished
// before the next street is dealt behind it; a pot going out to its winner is
// the moment the hand was played for and is allowed to take its time.
export const COLLECT_MS = 460;
export const AWARD_MS = 900;
// Each seat leaves a beat after the one before, so a collection reads as chips
// coming in from around the table rather than one shape closing on the middle.
const STAGGER_MS = 70;

/**
 * Chips crossing the table.
 *
 * Two moments used the same non-animation: a street ended and every bet on the
 * felt simply stopped existing while the pot number jumped, and a pot was won
 * and simply stopped existing while a stack number changed. The chips were
 * never seen to move, which is most of what a poker table is.
 *
 * They travel in a straight line. An arc would read better in isolation and
 * would cross the seats between here and the middle, which is worse — there are
 * up to nine of them around the edge, and a chip passing over somebody's cards
 * looks like it belongs to them.
 */
export default function ChipFlight({ entries, kind, flightId, seatPixel, centre }) {
  const clearChipFlight = useGameStore((s) => s.clearChipFlight);
  const duration = kind === "award" ? AWARD_MS : COLLECT_MS;

  useEffect(() => {
    const done = setTimeout(clearChipFlight, duration + STAGGER_MS * entries.length);
    return () => clearTimeout(done);
  }, [flightId, duration, entries.length, clearChipFlight]);

  if (!centre) return null;

  return entries.map((entry, index) => {
    const seat = seatPixel(entry.seat);
    if (!seat) return null;
    // A collection goes seat → middle; an award comes middle → seat.
    const from = kind === "award" ? centre : seat;
    const to = kind === "award" ? seat : centre;

    return (
      <span
        key={`${flightId}-${entry.seat}-${index}`}
        className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 animate-chip-fly"
        style={{
          left: from.x,
          top: from.y,
          "--fly-dx": `${to.x - from.x}px`,
          "--fly-dy": `${to.y - from.y}px`,
          animationDuration: `${duration}ms`,
          animationDelay: `${index * STAGGER_MS}ms`,
        }}
      >
        <ChipStack amount={entry.amount} size={kind === "award" ? 13 : 10} />
      </span>
    );
  });
}
