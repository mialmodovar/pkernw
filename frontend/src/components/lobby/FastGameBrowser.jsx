import { useState } from "react";

import useFastGameStore from "../../store/fastGameStore";
import useWalletStore from "../../store/walletStore";
import PlayerFaces from "./PlayerFaces";
import { drawLabel, historyNet, myResult, netLabel, winnerName } from "./fastHistory";
import { payoutRows, prizeRows, seatCounts, tierAction, tierBlurb } from "./fastTiers";

/**
 * The games you sit down at, for whichever tab is asking.
 *
 * One component for both tabs, because a Spin n Go and a Sit n Go are the same
 * card twice: a price, a seat count, and a button. What differs is what the card
 * promises — a draw or a set of places — and that comes off the format itself.
 *
 * `formatKeys` is which of them this tab shows. The store holds all of them
 * regardless, because a queue fills up whether or not you are looking at its tab.
 */
export default function FastGameBrowser({ formatKeys, onOpenTable }) {
  const { formats, myGame, history, top, loading, error, sit, leave, sitting } = useFastGameStore();
  const balance = useWalletStore((s) => s.balance);
  const [oddsOpen, setOddsOpen] = useState(null);

  const shown = formats.filter((one) => formatKeys.includes(one.key));
  // Your own games in these formats. The Sit n Go tab has no business listing
  // your Spin n Gos, and the other way round.
  const rows = history.filter((one) => formatKeys.includes(one.key));
  const board = top.filter((one) => formatKeys.includes(one.key));

  if (loading && !formats.length) {
    return <p className="text-(--color-text-muted)">Loading...</p>;
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-5">
      {shown.map((format) => (
        <section key={format.key} className="space-y-3">
          {/* The heading earns its place only where a tab shows more than one
              format — the Spin n Go tab would just be saying its own name. */}
          {shown.length > 1 && (
            <h2 className="text-sm font-semibold text-(--color-silver)">
              {format.label}
              <span className="ml-2 text-xs font-normal text-(--color-text-muted)">
                {tierBlurb(format)}
              </span>
            </h2>
          )}
          <p className="text-sm text-(--color-text-muted) leading-snug">{format.blurb}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            {format.tiers.map((tier) => {
              const [seated, needed] = seatCounts(tier);
              const action = tierAction(tier, { mine: myGame, balance });
              const busy = sitting === `${tier.key}:${tier.stake}`;
              const detailKey = `${tier.key}:${tier.stake}`;

              return (
                <div key={detailKey} className="panel-raised rounded-xl p-4 space-y-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-2xl font-bold text-(--color-highlight-text) tabular-nums">
                      🪙 {tier.stake}
                    </span>
                    <span className="text-xs text-(--color-text-muted) tabular-nums">
                      {seated} / {needed} seated
                    </span>
                  </div>

                  <p className="text-xs text-(--color-text-muted)">{tierBlurb(format)}</p>

                  {/* Who is already waiting. An empty row on an empty table
                      rather than a placeholder: the faces are the reason to look. */}
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
                        // Whoever fills the table is taken to it there and then.
                        // The others learn from their next poll — see the watch
                        // in LobbyPage, which fires on the change, never on the
                        // state.
                        const game = await sit(tier.key, tier.stake);
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
                      aria-pressed={oddsOpen === detailKey}
                      onClick={() => setOddsOpen(oddsOpen === detailKey ? null : detailKey)}
                      className="px-3 py-2 rounded text-xs font-semibold panel-raised
                                 text-(--color-text-muted) hover:text-(--color-silver) transition-colors"
                    >
                      Prizes
                    </button>
                  </div>

                  {action.note && (
                    <p className="text-xs text-(--color-text-muted)">{action.note}</p>
                  )}

                  {oddsOpen === detailKey && (
                    <TierPrizes tier={tier} drawn={format.draws_multiplier} />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {error && <p className="text-xs text-[#c76b7a]">{error}</p>}

      {/* Underneath: what happened to you, and — where the prize is a draw —
          what the format is capable of. */}
      <div className={`grid gap-4 pt-2 ${board.length > 0 ? "md:grid-cols-2" : ""}`}>
        <HistoryPanel rows={rows} />
        {board.length > 0 && <RecordPanel rows={board} />}
      </div>
    </div>
  );
}

/** What a tier pays: a ladder of odds, or a list of places. */
function TierPrizes({ tier, drawn }) {
  if (drawn) {
    return (
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
    );
  }

  return (
    <div className="pt-2 border-t border-(--color-border) space-y-1">
      {payoutRows(tier).map((row) => (
        <div key={row.place} className="flex items-baseline justify-between text-xs">
          <span className="text-(--color-silver)">{row.label}</span>
          <span className="text-(--color-highlight-text) tabular-nums">
            🪙 {Number(row.coins || 0).toLocaleString()}
          </span>
          <span className="text-(--color-text-muted) tabular-nums w-16 text-right">
            {row.percentage}%
          </span>
        </div>
      ))}
      <p className="text-[11px] text-(--color-text-muted) pt-1 leading-snug">
        The buy-ins, split. Nothing is raked off.
      </p>
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
    </section>
  );
}
