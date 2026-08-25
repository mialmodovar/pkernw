import { useMemo, useState } from "react";

import TournamentCard from "./TournamentCard";
import { FILTERS, filterTournaments, groupByDay } from "./tournamentBrowsing";

const EMPTY = {
  all: "No tournaments yet.",
  open: "No tournament is taking registrations right now.",
  late: "Nothing is open for late registration.",
  mine: "You are not registered for anything.",
  finished: "You have not finished any tournaments yet.",
};

/**
 * Every tournament in one place, filtered and grouped by day.
 *
 * It used to be three headed lists — yours, upcoming, past — stacked down the
 * page, so finding a game meant scrolling past the other two, and a tournament
 * you were playing in appeared twice. One list with a filter is both shorter
 * and easier to search: the ordering already puts a game you are seated at
 * above one that starts on Thursday (see tournamentBrowsing.js).
 */
export default function TournamentBrowser({
  tournaments, onJoin, onOpen, onOpenTable, onQuit, onDelete, onEdit, onRebuy,
}) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Counts come from the unfiltered list, so a chip can say how much is behind
  // it before you press it — and an empty one says so rather than lying.
  const counts = useMemo(() => Object.fromEntries(
    FILTERS.map((entry) => [entry.key, tournaments.filter(entry.match).length]),
  ), [tournaments]);

  const groups = useMemo(
    () => groupByDay(filterTournaments(tournaments, filter, search)),
    [tournaments, filter, search],
  );

  return (
    // A column that fills whatever height it is given: the filters stay put and
    // the list scrolls under them, so the controls do not walk off the top of
    // the screen the moment there is more than a screenful of tournaments.
    <section className="flex flex-col min-h-0 gap-3">
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center gap-2">
        {/* Scrolls sideways on a phone rather than wrapping into three rows of
            chips above a list nobody can see any more. */}
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 sm:pb-0 sm:flex-wrap">
          {FILTERS.map((entry) => {
            const active = entry.key === filter;
            return (
              <button
                key={entry.key}
                onClick={() => setFilter(entry.key)}
                aria-pressed={active}
                className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors border ${
                  active
                    ? "bg-(--color-accent) text-(--color-accent-text) border-(--color-border-strong)"
                    : "panel-raised text-(--color-text-muted) border-(--color-border) hover:text-(--color-silver)"
                }`}
              >
                {entry.label}
                <span className={`ml-1 tabular-nums ${active ? "opacity-80" : "opacity-60"}`}>
                  {counts[entry.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or host…"
          aria-label="Search tournaments"
          className="input-field rounded px-2.5 py-1 text-xs transition-colors sm:ml-auto sm:w-52"
        />
      </div>

      {groups.length === 0 ? (
        <p className="text-(--color-text-muted) text-sm py-4">
          {search ? `Nothing matches “${search}”.` : EMPTY[filter]}
        </p>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 -mr-1">
          {groups.map((group, index) => (
            <div key={group.key} className={`space-y-1.5 ${group.past ? "opacity-75" : ""}`}>
              {/* Sticks to the top of the scroller, so you always know which
                  day you are looking at part way down a long list. */}
              {/* The first day that is over gets said out loud, once: below this
                  line is history, and everything above it is a game somebody
                  can still join, play or be waiting for. */}
              {group.past && !groups.slice(0, index).some((one) => one.past) && (
                <p className="flex items-center gap-2 pt-2 text-[10px] uppercase tracking-[0.2em]
                              text-(--color-text-muted)">
                  <span className="flex-1 h-px bg-(--color-border)" />
                  Played
                  <span className="flex-1 h-px bg-(--color-border)" />
                </p>
              )}
              <h3 className={`text-[11px] font-semibold uppercase tracking-wide
                             sticky top-0 py-1 bg-[var(--color-surface-sunken)] backdrop-blur-sm z-10 rounded ${
                group.past ? "text-(--color-text-muted) opacity-70" : "text-(--color-text-muted)"
              }`}>
                {group.label}
              </h3>
              {group.tournaments.map((tournament) => (
                <TournamentCard
                  key={tournament.id}
                  tournament={tournament}
                  onJoin={onJoin}
                  onOpen={onOpen}
                  onOpenTable={onOpenTable}
                  onQuit={onQuit}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  onRebuy={onRebuy}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
