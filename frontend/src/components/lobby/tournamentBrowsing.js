/**
 * What order a list of tournaments goes in, and what filters it offers.
 *
 * Pure and separate from the rendering, because "which tournament should a
 * player see first" is a rule worth being able to state and test, not something
 * to read out of JSX.
 */

/** The moment a tournament belongs to: when it is due, or failing that, when it
 *  was made. Everything below groups and sorts on this one answer. */
export function tournamentWhen(tournament) {
  const raw = tournament.scheduled_start_at || tournament.created_at;
  const time = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(time) ? null : time;
}

/**
 * How loudly a tournament should be asking for attention.
 *
 * Lower sorts first. The order is the order a player cares about: something you
 * are already playing, then something you can still get into and that is
 * running out of time, then what is coming, then what is over.
 */
export const PRIORITY = {
  live: 0,      // you are in it and it is under way — go back to your seat
  lateReg: 1,   // running, joinable, and closing
  open: 2,      // in the lobby, waiting for players
  scheduled: 3, // in the lobby with a start time in the future
  finished: 4,
};

export function tournamentPriority(tournament) {
  if (tournament.status === "finished") return PRIORITY.finished;
  if (tournament.is_joined && tournament.status !== "lobby") return PRIORITY.live;
  if (tournament.late_registration_open) return PRIORITY.lateReg;
  if (tournament.scheduled_start_at) return PRIORITY.scheduled;
  return PRIORITY.open;
}

export const FILTERS = [
  // Everything, finished included. It used to mean "everything except the
  // past", which is not what the word says and hid the result of last night
  // from anybody who had not thought to press Finished. What keeps a list of
  // fifty played nights from burying the two that matter is not the filter —
  // it is the order and the separation below: live and coming first, then the
  // past, under its own heading and drawn quieter.
  { key: "all", label: "All", match: () => true },
  { key: "open", label: "Open", match: (t) => t.status === "lobby" && !t.is_joined },
  { key: "late", label: "Late reg", match: (t) => Boolean(t.late_registration_open) },
  { key: "mine", label: "Mine", match: (t) => Boolean(t.is_joined) && t.status !== "finished" },
  { key: "finished", label: "Finished", match: (t) => t.status === "finished" },
];

export function filterTournaments(tournaments, filterKey, search = "") {
  const filter = FILTERS.find((entry) => entry.key === filterKey) || FILTERS[0];
  const term = search.trim().toLowerCase();
  return tournaments.filter((tournament) => {
    if (!filter.match(tournament)) return false;
    if (!term) return true;
    // Host as well as name: "whose game is this" is how people refer to them.
    return `${tournament.name} ${tournament.host_name}`.toLowerCase().includes(term);
  });
}

/**
 * Sorted by how much they want looking at, then by when.
 *
 * Finished tournaments run newest-first — you are looking for the last result,
 * not the first one ever played. Everything else runs soonest-first.
 */
export function sortTournaments(tournaments) {
  return [...tournaments].sort((a, b) => {
    const priority = tournamentPriority(a) - tournamentPriority(b);
    if (priority) return priority;

    const whenA = tournamentWhen(a);
    const whenB = tournamentWhen(b);
    if (whenA == null || whenB == null) return whenA == null ? 1 : -1;

    const newestFirst = a.status === "finished" && b.status === "finished";
    return newestFirst ? whenB - whenA : whenA - whenB;
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether this tournament is something that already happened. */
export function isPast(tournament) {
  return tournament.status === "finished";
}

/** Midnight local time, as a number — the key a day groups on. */
function startOfDay(time) {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** "Today", "Tomorrow", "Yesterday", or the date itself. */
export function dayLabel(time, now = Date.now()) {
  if (time == null) return "No date set";
  const days = Math.round((startOfDay(time) - startOfDay(now)) / DAY_MS);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short", day: "numeric", month: "short",
    // A year is noise until it is not this one.
    year: new Date(time).getFullYear() === new Date(now).getFullYear() ? undefined : "numeric",
  }).format(new Date(time));
}

/**
 * Sorted, then cut into days — [{ key, label, tournaments }].
 *
 * Order comes from the sort, not from the calendar: a running game you are in
 * stays at the top even if it began yesterday. Days appear in the order their
 * first tournament does, so the grouping never reorders anything.
 */
export function groupByDay(tournaments, now = Date.now()) {
  const groups = [];
  const byKey = new Map();

  for (const tournament of sortTournaments(tournaments)) {
    const when = tournamentWhen(tournament);
    // A day, and whether it is over: a night that finished this afternoon must
    // not share a heading with one that starts this evening, or the past is
    // sitting in among the things you can still do something about. `past` is
    // what the list draws quieter — see TournamentBrowser.
    const past = isPast(tournament);
    const day = when == null ? "none" : String(startOfDay(when));
    const key = past ? `past:${day}` : day;
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: dayLabel(when, now), past, tournaments: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.tournaments.push(tournament);
  }
  return groups;
}
