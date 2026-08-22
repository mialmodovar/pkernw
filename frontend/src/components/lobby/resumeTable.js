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
 * More than one is ordinary — two Sit n Gos and a tournament is an evening —
 * so the one you were last at wins: that is the one you stepped away from and
 * the one you mean by "back to the table". Failing that, the newest, which is
 * the one that has just started dealing.
 */
export function tableToResume(tournaments = [], lastTableId = null) {
  const live = tournaments.filter(seatIsLive);
  if (!live.length) return null;
  const last = live.find((one) => Number(one.id) === Number(lastTableId));
  if (last) return last;
  return live.reduce((newest, one) => (one.id > newest.id ? one : newest));
}

/** Every table you are seated at, newest first — the tabs at the top of one. */
export function liveSeats(tournaments = []) {
  return tournaments.filter(seatIsLive).sort((a, b) => b.id - a.id);
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
export function handToShow(hands, tournament, now = Date.now()) {
  const hand = hands?.[tournament?.id] || null;
  if (!hand || !tournament) return [];
  if (!hand.cards?.length) return [];
  if (now - (hand.at || 0) > HAND_FRESH_MS) return [];
  return hand.cards;
}

/**
 * Every table you have open, as the strip along the top of one draws them.
 *
 * Seats first and newest first, then whatever you are watching. The two are
 * different kinds of thing: a seat comes from the server and cannot be closed
 * because you are in it, while a watched table is this browser's own note and
 * can be shut whenever you have seen enough.
 *
 * A table you are both seated at and watching is one table, and the seat wins —
 * it is the truer of the two, and two tabs for one game is how somebody ends up
 * folding the wrong hand.
 */
export function openTableTabs(seats = [], watching = []) {
  const seated = liveSeats(seats).map((one) => ({
    id: one.id,
    label: resumeLabel(one),
    kind: "seat",
    status: one.status,
  }));
  const seatedIds = new Set(seated.map((one) => Number(one.id)));

  const watched = watching
    .filter((one) => !seatedIds.has(Number(one.id)))
    .map((one) => ({
      id: one.id,
      label: one.name || `Table ${one.table ?? ""}`.trim(),
      kind: "watch",
      table: one.table,
    }));

  return [...seated, ...watched];
}

/**
 * Where the way-back-to-the-table pill has no business being.
 *
 * At a table, obviously — a door drawn on the inside of the room it opens into
 * is the thing this pill exists to stop, and it was the whole complaint that
 * led to it. That includes the layout sandbox, which is a table by any measure
 * a player would use: it renders the same felt, and a pill floating over it
 * offering to take you to a table is nonsense.
 *
 * And the signed-out pages, which nobody reaches holding a live seat.
 *
 * Pure so the list can be read and added to: every route that draws a felt has
 * to be in it, and the sandbox was not.
 */
const NO_SHORTCUT = [
  /^\/tournament\/\d+\/(play|watch)\b/,
  /^\/dev\/table\b/,
  /^\/(login|register|recover)\b/,
];

export function shortcutHiddenOn(pathname) {
  return NO_SHORTCUT.some((pattern) => pattern.test(String(pathname || "")));
}
