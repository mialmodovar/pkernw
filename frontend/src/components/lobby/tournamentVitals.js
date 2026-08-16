/**
 * The handful of numbers that answer "how is this tournament going?"
 *
 * Four things: how many are left of how many sat down, what an average stack
 * looks like, how many places pay, and how long is left to register. They were
 * scattered — some only inside a panel you had to open, some nowhere at all —
 * and they are the same four numbers wherever you are looking at a tournament
 * from, so they are worked out in one place and drawn in three.
 */

/** "8:20", or "1h 05m" once there is more than an hour of it. */
export function countdownLabel(seconds) {
  if (seconds == null || seconds < 0) return null;
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
  }
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * `tournament` is either payload — the list row or the full detail. `live`
 * carries anything the table knows better than the last REST snapshot did:
 * `playersLeft` above all, which moves on every knockout while the snapshot is
 * seconds old.
 */
export function tournamentVitals(tournament, live = {}) {
  const status = tournament?.status;
  const started = status === "running" || status === "paused" || status === "finished";

  const players = tournament?.players || [];
  const alive = players.filter((p) => !p.is_eliminated);
  // Registrations, which is what "of 100" means — a rebuy does not make you a
  // second entrant in the count people quote.
  const entrants = players.length || tournament?.player_count || 0;

  const playersLeft = live.playersLeft ?? (players.length ? alive.length : entrants);

  // Chips in play divided by players holding them. Only the detail payload
  // carries stacks, so a list row simply has nothing to say here.
  const chipsInPlay = alive.reduce((sum, p) => sum + (p.chips || 0), 0);
  const averageStack = live.averageStack
    ?? (started && alive.length && chipsInPlay ? Math.round(chipsInPlay / alive.length) : null);

  return {
    started,
    entrants,
    playersLeft,
    averageStack,
    placesPaid: tournament?.payout_structure?.length || 0,
    // Null unless the engine is running and the schedule can be read as a
    // clock — "until level 4" stays the fallback, not a number in seconds.
    lateRegSeconds: tournament?.late_registration_seconds_left ?? null,
  };
}

/**
 * The same vitals as a row of labelled values, so the header strip and the
 * lobby banner say the same things in the same order.
 *
 * Each row carries two wordings of itself: `label` + `value` for a banner with
 * room to head its numbers, and `short` for a strip in a header where the whole
 * lot has to fit on one line beside three buttons.
 *
 * `formatStack` is the caller's: the table shows chips or big blinds depending
 * on a toggle, and the lobby has no such toggle.
 */
export function vitalsSummary(vitals, { formatStack = (n) => n.toLocaleString() } = {}) {
  const rows = [];
  if (vitals.started && vitals.entrants) {
    rows.push({
      key: "left",
      label: "Players",
      value: `${vitals.playersLeft}/${vitals.entrants}`,
      short: `${vitals.playersLeft}/${vitals.entrants} left`,
    });
  }
  if (vitals.averageStack != null) {
    rows.push({
      key: "avg",
      label: "Avg stack",
      value: formatStack(vitals.averageStack),
      short: `${formatStack(vitals.averageStack)} avg`,
    });
  }
  if (vitals.placesPaid > 0) {
    rows.push({
      key: "paid",
      label: "Places paid",
      value: String(vitals.placesPaid),
      short: `${vitals.placesPaid} paid`,
    });
  }
  const countdown = countdownLabel(vitals.lateRegSeconds);
  if (countdown) {
    rows.push({ key: "latereg", label: "Late reg", value: countdown, short: `late reg ${countdown}` });
  }
  return rows;
}
