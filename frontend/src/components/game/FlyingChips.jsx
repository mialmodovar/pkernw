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
export default function FlyingChips({ items }) {
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    setArrived(false);
    // One frame at the start position, so the transition has something to run
    // from rather than snapping straight to the destination.
    const id = requestAnimationFrame(() => setArrived(true));
    return () => cancelAnimationFrame(id);
  }, [items]);

  if (!items || !items.length) return null;

  return (
    <>
      {items.map((item) => {
        const at = arrived ? item.to : item.from;
        return (
          <div
            key={item.id}
            className="absolute z-10 pointer-events-none flex items-end gap-1
                       -translate-x-1/2 -translate-y-1/2 transition-all duration-500 ease-in-out"
            style={{ left: at.left, top: at.top, opacity: arrived ? 0.15 : 1 }}
          >
            <ChipStack amount={item.amount} size={10} />
          </div>
        );
      })}
    </>
  );
}
