/**
 * Showing what you had, once the hand is over.
 *
 * Asked from two places now — the bar in the action panel and the cards
 * themselves — so the question of whether you may show is answered once. Two
 * copies of these conditions would eventually disagree, and the disagreement
 * would be a button that does nothing.
 */

import { send } from "../../api/socket";
import useGameStore from "../../store/gameStore";

/**
 * Whether this seat can still show, and how.
 *
 * `mySeat` is your seat number and `myCards` the two you were dealt. Returns
 * `canShow` and a `show(indices)` that names the cards by position, which is
 * what the server expects.
 */
export function useShowCardsOffer(mySeat, myCards) {
  const open = useGameStore((s) => s.showCardsOpen);
  // Nothing to offer once your cards are already face up. That covers all three
  // ways it happens — a showdown, an all-in runout, or having just shown them
  // yourself — because each of those puts the cards on your own seat, and a
  // seat with cards on it is a hand everybody can already see.
  //
  // Reading the seat rather than remembering the click also means the offer
  // goes when the server confirms, not when the button is pressed: the reveal
  // window opens a beat after the hand ends, and a click that lands early is
  // refused.
  const alreadyPublic = useGameStore((s) => (
    mySeat == null ? false : Boolean(s.players.find((p) => p.seat === mySeat)?.cards?.length)
  ));
  // An all-in runout turns every hand in it face up before the board is even
  // out — going all in preflop means the table has been looking at your cards
  // for three streets. Checked separately from the seat above so that holds
  // even if a seat is missing from a reading.
  const runoutRevealed = useGameStore((s) => Boolean(s.allInEquity?.length));

  const cards = myCards || [];
  const canShow = Boolean(open && !alreadyPublic && !runoutRevealed && cards.length > 0);

  return {
    canShow,
    show: (indices) => {
      if (!canShow) return;
      send({ type: "show_cards", cards: indices });
    },
  };
}
