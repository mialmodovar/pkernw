import useGameStore from "../../store/gameStore";
import { tournamentVitals, vitalsSummary } from "../lobby/tournamentVitals";
import { useCountdown } from "../lobby/useCountdown";
import { formatChips } from "./formatChips";

/**
 * How the tournament is going, on the header, without opening anything.
 *
 * These four numbers used to live only inside the info panel, so knowing
 * whether you were near the money — or whether there was still time for the
 * table to fill up — meant opening a panel over the felt mid-hand. They fit on
 * one line, so they belong on it.
 *
 * The count of players comes off the live table summaries rather than the REST
 * snapshot beside them: a knockout moves it immediately, and the snapshot is up
 * to eight seconds old.
 */
export default function TableVitals({ tournament }) {
  const tableSummaries = useGameStore((s) => s.tableSummaries);
  const showBB = useGameStore((s) => s.showBB);
  const bb = useGameStore((s) => s.level?.big_blind || 0);
  const lateRegSeconds = useCountdown(tournament?.late_registration_seconds_left ?? null);

  const playersLeft = tableSummaries.length
    ? tableSummaries.reduce((sum, table) => sum + (table.player_count || 0), 0)
    : undefined;

  const rows = vitalsSummary(
    { ...tournamentVitals(tournament, { playersLeft }), lateRegSeconds },
    { formatStack: (chips) => formatChips(chips, showBB, bb) },
  );
  if (!rows.length) return null;

  return (
    // From lg rather than md. At exactly 768px this used to switch on at the
    // same moment the Info / Hand history / Lobby buttons grew their labels and
    // their padding, which is the one width where the strip has the least room
    // — four vitals plus three labelled buttons overflowed the row. By 1024px
    // there is space for both.
    <span className="hidden lg:flex items-center gap-1.5 min-w-0 overflow-hidden
                     text-xs text-(--color-text-muted)">
      {rows.map((row) => (
        <span key={row.key} className="whitespace-nowrap">
          <span className="text-(--color-text-muted)">· </span>
          <span className={row.key === "latereg"
            ? "text-(--color-highlight-text) font-semibold"
            : "text-(--color-silver)"}>
            {row.short}
          </span>
        </span>
      ))}
    </span>
  );
}
