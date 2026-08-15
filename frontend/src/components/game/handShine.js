/**
 * When the hero's cards are worth looking at, and should catch the light.
 *
 * Two moments earn it. Before the flop: a premium holding — a big pair, or the
 * big broadway hands you would play from anywhere. After it: anything better
 * than a single pair, provided the hero's own cards are what made it, since a
 * board that pairs twice by itself is everybody's hand and nobody's news.
 *
 * The hand is evaluated here rather than read off the server's "Pair of Aces"
 * text, because the client already holds every card it needs and a phrase meant
 * for a human is a poor thing to branch on.
 */

import { parseCard } from "./cardStyles";

const RANK_VALUE = {
  2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

// Categories, weakest first — the same order the server's evaluator uses.
export const HIGH_CARD = 0;
export const ONE_PAIR = 1;
export const TWO_PAIR = 2;

// A pocket pair this big, or better, plays from anywhere.
const PREMIUM_PAIR = 10; // tens
// Unpaired holdings worth the same look: AK either way, AQ and KQ suited.
const PREMIUM_BROADWAY = [
  { high: 14, low: 13, suited: null },  // AK, suited or not
  { high: 14, low: 12, suited: true },  // AQs
  { high: 13, low: 12, suited: true },  // KQs
];

function toCard(value) {
  const parsed = typeof value === "string" ? parseCard(value) : value;
  if (!parsed) return null;
  const rank = RANK_VALUE[String(parsed.rank).toUpperCase()];
  return rank ? { rank, suit: parsed.suit } : null;
}

function toCards(values) {
  return (values || []).map(toCard).filter(Boolean);
}

/** True for the holdings that are worth a look on their own, before any board. */
export function isPremiumHoleCards(cards) {
  const hole = toCards(cards);
  if (hole.length !== 2) return false;

  const [high, low] = hole.map((c) => c.rank).sort((a, b) => b - a);
  if (high === low) return high >= PREMIUM_PAIR;

  const suited = hole[0].suit === hole[1].suit;
  return PREMIUM_BROADWAY.some((combo) =>
    combo.high === high && combo.low === low && (combo.suited === null || combo.suited === suited)
  );
}

/** The score of the best five of these cards: [category, ...tiebreakers]. */
export function bestFive(cards) {
  if (cards.length < 5) return null;
  let best = null;
  for (const combo of combinations(cards, 5)) {
    const score = scoreFive(combo);
    if (!best || compare(score, best) > 0) best = score;
  }
  return best;
}

function combinations(cards, size) {
  if (size === 0) return [[]];
  if (cards.length < size) return [];
  const [first, ...rest] = cards;
  return [
    ...combinations(rest, size - 1).map((combo) => [first, ...combo]),
    ...combinations(rest, size),
  ];
}

function scoreFive(cards) {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const straightTop = straightHigh(ranks);

  const counts = new Map();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) || 0) + 1);
  // Sorted by how many of a rank there are, then by the rank itself: the shape
  // of the hand, and the tiebreakers, in one list.
  const grouped = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = grouped.map(([, count]) => count).join("");
  const tiebreak = grouped.map(([rank]) => rank);

  if (flush && straightTop) return [8, straightTop];
  if (shape === "41") return [7, ...tiebreak];
  if (shape === "32") return [6, ...tiebreak];
  if (flush) return [5, ...ranks];
  if (straightTop) return [4, straightTop];
  if (shape === "311") return [3, ...tiebreak];
  if (shape === "221") return [TWO_PAIR, ...tiebreak];
  if (shape === "2111") return [ONE_PAIR, ...tiebreak];
  return [HIGH_CARD, ...ranks];
}

/** The top of the straight these five ranks make, or 0 — the wheel plays low. */
function straightHigh(ranks) {
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  if (unique.length !== 5) return 0;
  if (unique[0] - unique[4] === 4) return unique[0];
  if (unique.join() === [14, 5, 4, 3, 2].join()) return 5; // the wheel
  return 0;
}

function compare(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/**
 * Should the hero's cards shine, holding these against this board?
 */
export default function handShines(holeCards, communityCards) {
  const hole = toCards(holeCards);
  if (hole.length !== 2) return false;

  const board = toCards(communityCards);
  if (board.length < 3) return isPremiumHoleCards(holeCards);

  const mine = bestFive([...hole, ...board]);
  if (!mine || mine[0] < TWO_PAIR) return false;

  // On the river the board alone can make five cards. If the hero's cards add
  // nothing to it, the hand belongs to the whole table and is no news.
  const theirs = bestFive(board);
  return !theirs || beatsTheBoard(mine, theirs);
}

// How much of a score is the hand itself rather than a kicker: the two pairs of
// a two pair, the rank of a set. Out-kicking the board is not making a hand,
// so the comparison stops before the kickers.
const HAND_ITSELF = { 2: 3, 3: 2, 4: 2, 5: 6, 6: 3, 7: 2, 8: 2 };

function beatsTheBoard(mine, theirs) {
  if (mine[0] !== theirs[0]) return mine[0] > theirs[0];
  const significant = HAND_ITSELF[mine[0]] ?? mine.length;
  return compare(mine.slice(0, significant), theirs.slice(0, significant)) > 0;
}
