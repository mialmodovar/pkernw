import { useEffect } from "react";

import useGameStore from "../../store/gameStore";

// Long enough for the hard shake to finish twice — see .animate-quake-hard.
const SETTLE_MS = 1800;

/**
 * The class the table wears when a card has just turned the hand over.
 *
 * Clears itself, like every other one-shot animation here: the store holds no
 * timers, because a component that unmounts mid-animation would leave one
 * running with nothing to update.
 */
export default function useEquityQuake() {
  const shake = useGameStore((s) => s.equityShake);
  const clearEquityShake = useGameStore((s) => s.clearEquityShake);
  const id = shake?.id ?? null;

  useEffect(() => {
    if (id == null) return undefined;
    const timer = setTimeout(() => clearEquityShake(id), SETTLE_MS);
    return () => clearTimeout(timer);
    // Keyed on the id, so a second big card restarts the shake rather than
    // inheriting what was left of the first one's.
  }, [id, clearEquityShake]);

  if (!shake) return "";
  return shake.intensity === "hard" ? "animate-quake-hard" : "animate-quake";
}
