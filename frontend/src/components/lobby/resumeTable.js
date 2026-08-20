/**
 * The way back to a table you are still sitting at.
 *
 * Leaving the felt used to be impossible: any page that listed your tournaments
 * sent you straight back to it, so checking the lobby mid-game was not something
 * the app let you do. It does now, which means there has to be an obvious way
 * back — a seat you have walked away from is still being dealt to, and finding
 * it again should not mean hunting through a list.
 *
 * Pure. What counts as "still playing" is one predicate, and the same one the
 * arrival redirect uses, so the button appears exactly when there is somewhere
 * for it to go.
 */

/** How long a remembered hand is worth showing. Past this it is history. */
export const HAND_FRESH_MS = 3 * 60 * 1000;

/** A seat of yours with cards still being dealt to it. Paused counts: the
 *  tournament is coming back, and your stack is still in it. */
export function seatIsLive(tournament) {
  return Boolean(
    tournament
    && tournament.is_joined
    && (tournament.status === "running" || tournament.status === "paused")
    && !tournament.my_finish_position,
  );
}

/**
 * Which table to offer, out of everything the lobby knows about.
 *
 * More than one is possible — a coin tournament running while a Spin n Go fires
 * — and the newest is the right answer: it is the one that just started dealing.
 */
export function tableToResume(tournaments = []) {
  const live = tournaments.filter(seatIsLive);
  if (!live.length) return null;
  return live.reduce((newest, one) => (one.id > newest.id ? one : newest));
}

/**
 * What the button says it is taking you back to.
 *
 * A tournament has a name somebody chose. An instant game has a name the server
 * generated, which is the format and the stake — and that is exactly what is
 * worth printing, so it is rebuilt here rather than trusted to read well.
 */
export function resumeLabel(tournament) {
  if (!tournament) return "";
  const fast = { spingo: "Spin n Go", sitngo: "Sit n Go" }[tournament.format];
  if (fast) {
    const seats = tournament.players_per_table === 2 ? "Heads up" : `${tournament.players_per_table}-max`;
    const label = tournament.format === "spingo" ? fast : `${fast} · ${seats}`;
    return `${label} · \u{1FA99} ${tournament.buy_in_coins}`;
  }
  return tournament.name || "your table";
}

/**
 * The hand to print on the button, if there is one worth printing.
 *
 * Only the hand from this table, and only while it is recent enough to still be
 * the hand — a pair of aces from ten minutes ago is not information, it is a
 * reason to misplay the next decision.
 */
export function handToShow(lastHand, tournament, now = Date.now()) {
  if (!lastHand || !tournament) return [];
  if (lastHand.tournamentId != null && Number(lastHand.tournamentId) !== Number(tournament.id)) return [];
  if (!lastHand.cards?.length) return [];
  if (now - (lastHand.at || 0) > HAND_FRESH_MS) return [];
  return lastHand.cards;
}
