import { useEffect, useState } from "react";

import useStatsStore from "../../store/statsStore";
import { MiniCard } from "../game/HandReplay";
import { formatEuros } from "../game/formatMoney";
import BestHandModal from "./BestHandModal";

/**
 * One number, with the thing that qualifies it underneath.
 *
 * A tile is a button when there is somewhere to go from it, and a plain box
 * when there is not — rather than two components that have to be kept looking
 * like each other.
 */
function StatTile({ label, value, hint, children, onClick, title }) {
  const body = (
    <>
      <p className="text-xs text-(--color-text-muted)">{label}</p>
      <p className="text-lg font-semibold text-(--color-silver) truncate">{value}</p>
      {children}
      {hint && <p className="text-[11px] text-(--color-text-muted) truncate">{hint}</p>}
    </>
  );

  if (!onClick) {
    return <div className="panel-raised rounded-md px-3 py-2">{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="panel-raised rounded-md px-3 py-2 text-left w-full
                 hover:border-(--color-border-strong) transition-colors cursor-pointer"
    >
      {body}
    </button>
  );
}

function MeterRow({ label, pct }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-(--color-text-muted) mb-1">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-black/40 border border-(--color-border)">
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${Math.min(pct, 100)}%`,
            background: "linear-gradient(90deg, #4a0f18, var(--color-accent))",
          }}
        />
      </div>
    </div>
  );
}

export default function StatsPanel() {
  const { stats, fetchStats } = useStatsStore();
  const [replaying, setReplaying] = useState(false);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (!stats) return null;

  const best = stats.best_hand;

  return (
    <div className="panel rounded-lg p-4 space-y-3 shadow-lg shadow-black/40">
      <h2 className="text-sm font-semibold text-(--color-silver) uppercase tracking-wide">Stats</h2>
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Tournaments" value={stats.tournaments_played} />
        {/* The count is the fact; the rate is what it means. A cash in four is
            a different player from a cash in forty, and the count alone cannot
            tell you which one you are looking at. */}
        <StatTile
          label="Cashes"
          value={stats.cashes}
          hint={stats.tournaments_completed > 0 ? `${stats.itm_pct}% in the money` : null}
        />
        {/* Everything anybody has ever taken home. Not net: what the nights
            cost is the settlement ledger's business, and it has a panel of its
            own further down this column. */}
        <StatTile label="Winnings" value={formatEuros(stats.winnings_cents || 0)} />
        <StatTile
          label="Best hand"
          value={best?.name || "—"}
          onClick={best ? () => setReplaying(true) : undefined}
          title={best ? "Replay the hand it was made in" : undefined}
          hint={best ? best.tournament_name : "No showdown yet"}
        >
          {best?.cards?.length > 0 && (
            <span className="flex gap-1 my-1">
              {best.cards.map((card) => <MiniCard key={card} card={card} />)}
            </span>
          )}
        </StatTile>
      </div>
      {stats.hands_played > 0 ? (
        <div className="space-y-2 pt-1">
          <MeterRow label="VPIP" pct={stats.vpip_pct} />
          <MeterRow label="PFR" pct={stats.pfr_pct} />
          <p className="text-xs text-(--color-text-muted)">{stats.hands_played} hands played</p>
        </div>
      ) : (
        <p className="text-xs text-(--color-text-muted) pt-1">Not enough hand data yet.</p>
      )}

      {replaying && best && <BestHandModal best={best} onClose={() => setReplaying(false)} />}
    </div>
  );
}
