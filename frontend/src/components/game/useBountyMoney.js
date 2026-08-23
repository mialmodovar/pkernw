import { useCallback } from "react";

import useGameStore from "../../store/gameStore";
import { formatBounty } from "./formatMoney";

/**
 * How to print a bounty at the table you are looking at.
 *
 * Read from the store rather than passed down, like the deck a player has
 * chosen: every place that prints a bounty asks the same question, and
 * threading the answer through the seats, the mystery board, the reveal and the
 * final table would be the same answer written six times.
 */
export function useBountyMoney() {
  const fast = useGameStore((s) => s.fast);
  return useCallback((amount) => formatBounty(amount, fast), [fast]);
}
