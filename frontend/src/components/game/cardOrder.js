/**
 * Which way round a hand is held.
 *
 * The deck deals in the order it deals, so a pair arrived as "9♦ A♠" as often
 * as "A♠ 9♦" — and nobody holds a hand that way. Every player in the world
 * shuffles the big one to the left before they look twice, so the table does it
 * for them.
 *
 * The order is for the eye only. Which card is which is still the position the
 * cards were dealt in, because that is what the server means when it is told to
 * show card 0 — sorting the display and forgetting that would turn over the
 * wrong card.
 */

import { parseCard } from "./cardStyles";

const RANKS = "23456789TJQKA";

/** High card first. Unknown ranks sort last rather than throwing. */
export function rankValue(card) {
  const parsed = parseCard(card);
  const index = parsed ? RANKS.indexOf(parsed.rank.toUpperCase()) : -1;
  return index < 0 ? -1 : index;
}

/**
 * The positions of a hand, biggest first.
 *
 * Positions rather than cards: everything else — showing one, raising one,
 * ringing the winners — is keyed on where a card was dealt, and this is only
 * about where it is drawn.
 */
export function highToLow(cards) {
  return (cards || [])
    .map((card, index) => index)
    .sort((left, right) => {
      const difference = rankValue(cards[right]) - rankValue(cards[left]);
      // A stable tie-break, so two cards of the same rank never swap places on
      // a re-render for no reason anybody can see.
      return difference !== 0 ? difference : left - right;
    });
}

/** Whether sorting would actually move anything. */
export function needsSorting(cards) {
  return highToLow(cards).some((position, index) => position !== index);
}
