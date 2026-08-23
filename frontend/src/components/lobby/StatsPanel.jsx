import { useEffect, useState } from "react";
import Icon from "../icons/Icon";

import useStatsStore from "../../store/statsStore";
import { MiniCard } from "../game/HandReplay";
import { formatEuros } from "../game/formatMoney";
import BestHandModal from "./BestHandModal";
import { hasHandReads, summaryRow } from "./statsSummary";

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

// The games worth telling apart, and what to call each of them here. "All" is
// first because it is what most people want most of the time.
const SCOPES = [
  { key: "all", label: "All" },
  { key: "tournaments", icon: "trophy", title: "Tournaments" },
  { key: "spingo", icon: "spin", title: "Spin n Go" },
  { key: "sitngo", icon: "duel", title: "Sit n Go" },
];

// Remembered, because a panel that opens closed every time is one people stop
// opening. Local to the browser: it is the state of a drawer, not a fact about
// the player.
const OPEN_KEY = "poker.statsOpen";

const readOpen = () => {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
};

const writeOpen = (open) => {
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // Storage off: the drawer is then per-session, which is no worse than it
    // was before it was remembered at all.
  }
};

/**
 * Your record, small until you ask for it.
 *
 * It used to open with four tiles, two meters, a hand replay and a scope
 * selector — a quarter of the sidebar spent on something nobody reads while
 * they are looking for a game. Collapsed it is three numbers and a line; the
 * rest is one click away, and the click is remembered.
 */
export default function StatsPanel() {
  const { stats, scope, fetchStats } = useStatsStore();
  const [replaying, setReplaying] = useState(false);
  const [open, setOpen] = useState(readOpen);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (!stats) return null;

  const best = stats.best_hand;
  const summary = summaryRow(stats, scope);
  const toggle = () => {
    setOpen((was) => {
      writeOpen(!was);
      return !was;
    });
  };

  return (
    <div className="panel rounded-lg p-4 space-y-3 shadow-lg shadow-black/40">
      <div className="flex items-center justify-between gap-2">
        {/* The heading is the handle. A separate chevron would be a second
            small target beside a perfectly good one. */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide
                     text-(--color-silver) hover:text-(--color-highlight-text) transition-colors"
        >
          <span className={`text-[10px] leading-none transition-transform ${open ? "rotate-90" : ""}`}
            aria-hidden="true">
            ▶
          </span>
          Stats
        </button>
        {/* Which game these are about. Averaging a five-minute three-hander in
            with an evening's tournament describes neither. Only while the panel
            is open: collapsed, it is three numbers and the selector would be
            bigger than the thing it filters. */}
        {open && (
        <div className="flex items-center gap-0.5 p-0.5 rounded panel-raised"
          role="tablist" aria-label="Which games these stats cover">
          {SCOPES.map((one) => (
            <button
              key={one.key}
              type="button"
              role="tab"
              aria-selected={scope === one.key}
              title={one.title || "Every game"}
              onClick={() => fetchStats(one.key)}
              className={`px-1.5 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                scope === one.key
                  ? "bg-(--color-accent) text-(--color-accent-text)"
                  : "text-(--color-text-muted) hover:text-(--color-silver)"
              }`}
            >
              {one.icon
                ? <Icon name={one.icon} className="w-3.5 h-3.5" label={one.title} />
                : one.label}
            </button>
          ))}
        </div>
        )}
      </div>

      {/* Collapsed: the three numbers worth a glance, on one line. */}
      {!open && (
        <div className="flex items-baseline justify-between gap-2">
          {summary.map((one) => (
            <div key={one.key} title={one.title} className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-(--color-text-muted)">
                {one.label}
              </p>
              <p className="text-sm font-semibold text-(--color-silver) truncate tabular-nums">
                {one.value}
              </p>
            </div>
          ))}
          <button
            type="button"
            onClick={toggle}
            className="shrink-0 text-[11px] font-semibold text-(--color-text-muted)
                       hover:text-(--color-silver) transition-colors"
          >
            Details
          </button>
        </div>
      )}

      {open && (
      <div className="grid grid-cols-2 gap-2">
        <StatTile label={scope === "all" ? "Games" : "Played"} value={stats.tournaments_played} />
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
      )}
      {open && (hasHandReads(stats) ? (
        <div className="space-y-2 pt-1">
          <MeterRow label="VPIP" pct={stats.vpip_pct} />
          <MeterRow label="PFR" pct={stats.pfr_pct} />
          <p className="text-xs text-(--color-text-muted)">{stats.hands_played} hands played</p>
        </div>
      ) : (
        <p className="text-xs text-(--color-text-muted) pt-1">
          {scope === "all"
            ? "Not enough hand data yet."
            : "No hands in this kind of game yet."}
        </p>
      ))}

      {replaying && best && <BestHandModal best={best} onClose={() => setReplaying(false)} />}
    </div>
  );
}
