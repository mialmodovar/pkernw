import { useState } from "react";
import useGameStore from "../../store/gameStore";
import { formatChips } from "./formatChips";

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-(--color-text-muted)">{label}</span>
      <span className="text-(--color-silver) text-right">{children}</span>
    </div>
  );
}

/**
 * Tournament context that would otherwise force you back to the lobby: the
 * blinds you're playing, what's coming next, how many players are left, your
 * standing and the payouts. `tournament` is the REST detail already fetched by
 * GamePage — its `levels`, `payout_structure` and `players` were all being
 * fetched and thrown away.
 */
export default function TournamentInfoPanel({ tournament, username }) {
  const [open, setOpen] = useState(true);
  const level = useGameStore((s) => s.level);
  const tableSummaries = useGameStore((s) => s.tableSummaries);
  const showBB = useGameStore((s) => s.showBB);
  const bb = level?.big_blind || 0;

  const levels = tournament?.levels || [];
  // level_index counts every level including breaks, so it indexes `levels`.
  const nextLevel = level?.level_index != null ? levels[level.level_index + 1] : null;

  // Prefer the live per-table counts; fall back to the REST snapshot.
  const remaining = tableSummaries.length
    ? tableSummaries.reduce((sum, t) => sum + (t.player_count || 0), 0)
    : (tournament?.players || []).filter((p) => !p.is_eliminated).length;

  const stacks = (tournament?.players || [])
    .filter((p) => !p.is_eliminated)
    .map((p) => ({ username: p.username, chips: p.chips }))
    .sort((a, b) => b.chips - a.chips);

  const myRank = stacks.findIndex((p) => p.username === username) + 1;
  const averageStack = stacks.length
    ? Math.round(stacks.reduce((sum, p) => sum + p.chips, 0) / stacks.length)
    : 0;

  const payouts = tournament?.payout_structure || [];

  return (
    <div className="absolute top-2 left-2 z-10 w-56 panel rounded-lg text-xs shadow-lg shadow-black/50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-(--color-silver)
                   font-semibold uppercase tracking-wide text-[10px] hover:bg-white/5 transition-colors"
      >
        <span>{tournament?.name || "Tournament"}</span>
        <span className="text-(--color-text-muted)">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          <div className="space-y-1">
            <Row label="Blinds">
              {level ? `${level.small_blind}/${level.big_blind}${level.ante ? ` (${level.ante})` : ""}` : "—"}
            </Row>
            <Row label="Next level">
              {nextLevel
                ? nextLevel.is_break
                  ? `Break · ${nextLevel.duration_minutes} min`
                  : `${nextLevel.small_blind}/${nextLevel.big_blind}${nextLevel.ante ? ` (${nextLevel.ante})` : ""}`
                : "Last level"}
            </Row>
          </div>

          <div className="space-y-1 pt-2 border-t border-(--color-border)">
            <Row label="Players left">{remaining}</Row>
            <Row label="Avg stack">{formatChips(averageStack, showBB, bb)}</Row>
            {myRank > 0 && <Row label="Your rank">{`${myRank} of ${stacks.length}`}</Row>}
            {tableSummaries.length > 1 && <Row label="Tables">{tableSummaries.length}</Row>}
          </div>

          {payouts.length > 0 && (
            <div className="pt-2 border-t border-(--color-border) space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">Payouts</div>
              {payouts.slice(0, 5).map((row) => (
                <Row key={row.place} label={row.label || `${row.place}`}>
                  <span className="text-[#d9c07a]">{row.percentage}%</span>
                </Row>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
