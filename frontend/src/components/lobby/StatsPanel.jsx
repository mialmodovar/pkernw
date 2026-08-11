import { useEffect } from "react";
import useStatsStore from "../../store/statsStore";

function StatTile({ label, value }) {
  return (
    <div className="panel-raised rounded-md px-3 py-2">
      <p className="text-xs text-(--color-text-muted)">{label}</p>
      <p className="text-lg font-semibold text-(--color-silver)">{value}</p>
    </div>
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

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (!stats) return null;

  return (
    <div className="panel rounded-lg p-4 space-y-3 shadow-lg shadow-black/40">
      <h2 className="text-sm font-semibold text-(--color-silver) uppercase tracking-wide">Stats</h2>
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Tournaments" value={stats.tournaments_played} />
        <StatTile label="Best finish" value={stats.best_finish ?? "—"} />
        <StatTile label="Cashes" value={stats.cashes} />
        <StatTile label="Rebuys" value={stats.total_rebuys} />
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
    </div>
  );
}
