import { useState } from "react";

import useSpinGoStore from "../../store/spinGoStore";
import useWalletStore from "../../store/walletStore";
import PlayerFaces from "./PlayerFaces";
import { drawLabel, historyNet, myResult, netLabel, winnerName } from "./spinGoHistory";
import { prizeRows, seatCounts, tierAction, tierBlurb } from "./spinGoTiers";

/**
 * The Spin n Go tiers.
 *
 * Two stakes and one button each, which is the whole format: there is nothing to
 * configure, nobody to wait for a host, and no start time to read. You sit, and
 * when the third player sits the prize is drawn and the cards are in the air.
 *
 * The prize table is worth showing rather than hiding behind "up to 100×",
 * because a game whose whole point is the draw should say what the draw is. It
 * is folded away by default all the same — it is the same seven rows every time,
 * and most of the time you are here to sit down.
 */
export default function SpinGoBrowser({ onOpenTable }) {
  const { tiers, myGame, history, top, loading, error, sit, leave, sitting } = useSpinGoStore();
  const balance = useWalletStore((s) => s.balance);
  const [oddsOpen, setOddsOpen] = useState(null);

  if (loading && !tiers.length) {
    return <p className="text-(--color-text-muted)">Loading...</p>;
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
      <p className="text-sm text-(--color-text-muted) leading-snug">
        Three players, fifteen big blinds, three to five minutes. The prize is drawn when the
        third player sits — usually twice the buy-in, occasionally a hundred times it — and the
        winner takes all of it. Paid in coins.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {tiers.map((tier) => {
          const [seated, needed] = seatCounts(tier);
          const action = tierAction(tier, { mine: myGame, balance });
          const busy = sitting === tier.stake;

          return (
            <div key={tier.stake} className="panel-raised rounded-xl p-4 space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-2xl font-bold text-(--color-highlight-text) tabular-nums">
                  🪙 {tier.stake}
                </span>
                <span className="text-xs text-(--color-text-muted) tabular-nums">
                  {seated} / {needed} seated
                </span>
              </div>

              <p className="text-xs text-(--color-text-muted)">{tierBlurb(tier)}</p>

              {/* Who is already waiting. An empty row on an empty table rather
                  than a placeholder: the faces are the reason to look. */}
              <div className="h-6 flex items-center">
                <PlayerFaces players={tier.game?.waiting || []} />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!action.enabled || busy}
                  onClick={async () => {
                    if (action.kind === "leave") return leave();
                    if (action.kind === "open") return onOpenTable?.(myGame.id);
                    // Whoever fills the table is taken to it there and then. The
                    // other two learn from their next poll — see useSpinGoWatch,
                    // which fires on the change and never on the state.
                    const game = await sit(tier.stake);
                    if (game?.status === "running") onOpenTable?.(game.id);
                    return game;
                  }}
                  className={`flex-1 px-3 py-2 rounded text-sm font-semibold transition-colors ${
                    action.enabled && !busy
                      ? action.kind === "leave"
                        ? "btn-secondary"
                        : "btn-accent"
                      : "btn-secondary opacity-50 cursor-not-allowed"
                  }`}
                >
                  {busy ? "Sitting..." : action.label}
                </button>
                <button
                  type="button"
                  aria-pressed={oddsOpen === tier.stake}
                  onClick={() => setOddsOpen(oddsOpen === tier.stake ? null : tier.stake)}
                  className="px-3 py-2 rounded text-xs font-semibold panel-raised
                             text-(--color-text-muted) hover:text-(--color-silver) transition-colors"
                >
                  Prizes
                </button>
              </div>

              {action.note && (
                <p className="text-xs text-(--color-text-muted)">{action.note}</p>
              )}

              {oddsOpen === tier.stake && (
                <div className="pt-2 border-t border-(--color-border) space-y-1">
                  {prizeRows(tier).map((row) => (
                    <div key={row.multiplier} className="flex items-baseline justify-between text-xs">
                      <span className="text-(--color-silver) tabular-nums">{row.multiplier}×</span>
                      <span className="text-(--color-highlight-text) tabular-nums">
                        🪙 {row.prize_coins.toLocaleString()}
                      </span>
                      <span className="text-(--color-text-muted) tabular-nums w-16 text-right">
                        {row.chance}
                      </span>
                    </div>
                  ))}
                  <p className="text-[11px] text-(--color-text-muted) pt-1 leading-snug">
                    Averages three buy-ins — what the three of you paid in. Nothing is raked off.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="text-xs text-[#c76b7a]">{error}</p>}

      {/* Underneath: what happened to you, and what the format is capable of.
          Side by side, because they answer each other — the record board is the
          reason the column of lost stakes on the left is worth playing through. */}
      <div className="grid gap-4 md:grid-cols-2 pt-2">
        <HistoryPanel rows={history} />
        <RecordPanel rows={top} />
      </div>
    </div>
  );
}

/** Your own last games, newest first, with what they came to. */
function HistoryPanel({ rows = [] }) {
  const net = historyNet(rows);
  return (
    <section className="panel-raised rounded-xl p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-(--color-silver) uppercase tracking-wide">
          Your last games
        </h2>
        {rows.length > 0 && (
          <span
            title={`Across the ${rows.length} games listed`}
            className={`text-xs font-semibold tabular-nums ${
              net > 0 ? "text-(--color-highlight-text)" : "text-(--color-text-muted)"
            }`}
          >
            {netLabel(net)}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-(--color-text-muted) mt-2">
          Nothing yet. Sit at a table above.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-[rgba(196,178,165,0.12)]">
          {rows.map((row) => (
            <li key={row.id} className="py-1.5 flex items-center gap-2 text-xs">
              <span className={`w-10 shrink-0 font-semibold ${
                row.i_won ? "text-(--color-highlight-text)" : "text-(--color-text-muted)"
              }`}>
                {myResult(row)}
              </span>
              <span className="text-(--color-text-muted) tabular-nums shrink-0">
                🪙 {row.stake}
              </span>
              <span className="flex-1 min-w-0 truncate text-(--color-silver) tabular-nums">
                {drawLabel(row)}
              </span>
              {/* Whoever took it, when it was not you. */}
              {!row.i_won && (
                <span className="text-(--color-text-muted) truncate max-w-[7rem]">
                  {winnerName(row)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The three biggest draws in the app, whoever had them. */
function RecordPanel({ rows = [] }) {
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <section className="panel-raised rounded-xl p-4">
      <h2 className="text-sm font-semibold text-(--color-silver) uppercase tracking-wide">
        Biggest spins
      </h2>

      {rows.length === 0 ? (
        <p className="text-xs text-(--color-text-muted) mt-2">
          No spin has landed yet. The first hundred-times is going spare.
        </p>
      ) : (
        <ol className="mt-2 divide-y divide-[rgba(196,178,165,0.12)]">
          {rows.map((row, index) => (
            <li key={row.id} className="py-1.5 flex items-center gap-2 text-xs">
              <span className="shrink-0" aria-hidden="true">{medals[index] || "·"}</span>
              <span className={`flex-1 min-w-0 truncate ${
                row.i_won ? "text-(--color-highlight-text) font-semibold" : "text-(--color-silver)"
              }`}>
                {winnerName(row)}{row.i_won && " (you)"}
              </span>
              <span className="text-(--color-highlight-text) font-semibold tabular-nums shrink-0">
                {row.multiplier}×
              </span>
              <span className="text-(--color-text-muted) tabular-nums shrink-0 w-20 text-right">
                🪙 {Number(row.prize_coins || 0).toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
