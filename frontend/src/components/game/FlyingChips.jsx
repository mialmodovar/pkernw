import { useEffect, useState } from "react";
import ChipStack from "./ChipStack";

/**
 * Chips moving between a seat and the middle of the table — bets being
 * collected into the pot, and the pot going to whoever won it.
 *
 * Positions are the same percentages the seats are laid out with, and the
 * elements simply transition from one to the other, so nothing has to measure
 * the DOM or know the table's pixel size.
 */
const FLIGHT_MS = 500;

export default function FlyingChips({ items }) {
  const [arrived, setArrived] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    setArrived(false);
    setGone(false);
    // One frame at the start position, so the transition has something to run
    // from rather than snapping straight to the destination.
    const frame = requestAnimationFrame(() => setArrived(true));
    // Clear them once they land, instead of leaving ghosts on the table.
    const timer = setTimeout(() => setGone(true), FLIGHT_MS + 150);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [items]);

  if (!items || !items.length || gone) return null;

  return (
    <>
      {items.map((item) => {
        const at = arrived ? item.to : item.from;
        return (
          <div
            key={item.id}
            className="absolute z-10 pointer-events-none flex items-end gap-1
                       -translate-x-1/2 -translate-y-1/2 transition-all duration-500 ease-in-out
                       drop-shadow-[0_0_6px_rgba(212,175,55,0.6)]"
            style={{ left: at.left, top: at.top }}
          >
            <ChipStack amount={item.amount} size={16} />
          </div>
        );
      })}
    </>
  );
}
