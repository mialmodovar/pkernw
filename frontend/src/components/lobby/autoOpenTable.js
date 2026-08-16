/**
 * Getting a player to their seat without them having to find it.
 *
 * Two moments, and they are the same moment from the player's side: the
 * tournament starts while you are looking at the lobby, or you open the app to
 * find it already running. Either way there is a hand waiting on you and the
 * table is the only place you can do anything about it, so that is where you
 * go. Before this you were left on a list with your own game somewhere in it,
 * one click away, while the blinds went through your stack.
 *
 * The one thing this must never do is drag you back. Pressing "Back home" from
 * the table has to leave you at home, so the arrival redirect is spent once per
 * page load and the started-just-now redirect only fires on a status actually
 * changing under you — never on the state it is already in.
 */

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Whether opening the app still owes this player a look at their table.
 *
 * Spent once, by whichever page gets there first — the home list or a
 * tournament lobby opened from a link. An app that opened *at* a table has
 * already arrived, and firing later would be the drag-you-back case above.
 */
let entryPendingFor = tableRouteOnLoad() ? null : "unclaimed";

function tableRouteOnLoad() {
  if (typeof window === "undefined") return false;
  return /^\/tournament\/\d+\/(play|watch)\b/.test(window.location.pathname);
}

/** True once, for the first caller after the app opens. */
export function claimEntryRedirect() {
  if (entryPendingFor !== "unclaimed") return false;
  entryPendingFor = "claimed";
  return true;
}

/** Test seam — the flag is deliberately per page load, not per mount. */
export function resetEntryRedirect(pending = true) {
  entryPendingFor = pending ? "unclaimed" : "claimed";
}

/** A seat of yours with a hand about to be dealt to it. */
export function seatIsWaiting(tournament) {
  return Boolean(
    tournament
    && tournament.is_joined
    && tournament.status === "running"
    // Out, and not yet bought back in: there is no seat to send you to.
    && !tournament.my_finish_position,
  );
}

/**
 * Which tournament to open, given what the last poll said.
 *
 * `previousStatuses` is a Map of id → status as of the previous look; a
 * tournament missing from it has not been seen before, which is why arriving
 * mid-tournament is the `entryPending` case rather than a start.
 */
export function tableToOpen(tournaments, previousStatuses, { entryPending = false } = {}) {
  const started = tournaments.find(
    (t) => previousStatuses.get(t.id) === "lobby" && seatIsWaiting(t),
  );
  if (started) return started.id;
  return entryPending ? (tournaments.find(seatIsWaiting)?.id ?? null) : null;
}

/**
 * Watch a list of tournaments and leave for the table when one wants you.
 *
 * `tournaments` is the lobby list payload — rows carrying `is_joined`,
 * `status` and `my_finish_position`.
 */
export function useAutoOpenTable({ tournaments, user, loading }) {
  const navigate = useNavigate();
  const previous = useRef(new Map());

  useEffect(() => {
    // Nothing to conclude from a list that has not arrived: acting on it would
    // spend the arrival redirect on an empty page and never fire again.
    if (loading || !user || !tournaments.length) return;

    const id = tableToOpen(tournaments, previous.current, {
      entryPending: claimEntryRedirect(),
    });
    for (const tournament of tournaments) previous.current.set(tournament.id, tournament.status);
    // Replaced rather than pushed: "back" from a table you were sent to should
    // be the page you were on, not a bounce straight back to the table.
    if (id != null) navigate(`/tournament/${id}/play`, { replace: true });
  }, [tournaments, user, loading, navigate]);
}
