import { useState } from "react";

import useFastGameStore from "../../store/fastGameStore";
import useWalletStore from "../../store/walletStore";
import PlayerFaces from "./PlayerFaces";
import { drawLabel, historyNet, myResult, netLabel, winnerName } from "./fastHistory";
import {
  formatMeta, payoutRows, prizeRows, prizeSummary, seatCounts, seatPips, tierAction,
} from "./fastTiers";

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
          {/* The format, said properly and always — even on a tab that shows
              only one. What kind of game this is is the first thing anybody
              needs, and it used to be a small grey heading that the Spin n Go
              tab did not draw at all. */}
          <header className="flex items-start gap-3">
            <span className="text-3xl leading-none shrink-0" aria-hidden="true">{format.icon}</span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-(--color-silver) tracking-wide">
                {format.label}
              </h2>
              <p className="text-xs text-(--color-highlight-text) tabular-nums">
                {formatMeta(format)}
              </p>
              <p className="text-xs text-(--color-text-muted) leading-snug mt-1 max-w-prose">
                {format.blurb}
              </p>
            </div>
          </header>

          <div className="grid gap-3 sm:grid-cols-2">
            {format.tiers.map((tier) => {
              const [seated, needed] = seatCounts(tier);
              const action = tierAction(tier, { mine: myGame, balance });
              const busy = sitting === `${tier.key}:${tier.stake}`;
              const detailKey = `${tier.key}:${tier.stake}`;
              const prize = prizeSummary(tier, format);
              const waiting = tier.game?.waiting || [];

              return (
                <div
                  key={detailKey}
                  className={`panel-raised rounded-xl p-3 space-y-2.5 transition-colors ${
                    seated > 0 ? "border-(--color-border-strong)" : ""
                  }`}
                >
                  {/* What it costs, labelled. On its own the number could be
                      read as what it pays — which is the line under it. */}
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-(--color-text-muted)">
                      Buy-in
                    </span>
                    <span className="text-xl font-bold text-(--color-silver) tabular-nums">
                      🪙 {tier.stake}
                    </span>
                  </div>

                  {/* What it pays. This was behind the Prizes button, which left
                      the cost as the only figure on the card. */}
                  <div className="flex items-baseline justify-between gap-2 pt-2
                                  border-t border-(--color-border)">
                    <span className="text-[10px] uppercase tracking-wider text-(--color-text-muted)">
                      {prize.label}
                    </span>
                    <span className="text-sm font-semibold text-(--color-highlight-text) tabular-nums">
                      {prize.value}
                    </span>
                  </div>

                  {/* Seats, as a shape and a number. The faces only take a row
                      when there are faces — an empty table used to keep an empty
                      one, which is most of what made these cards hollow. */}
                  <div className="flex items-center gap-2">
                    <span className="flex gap-1" aria-hidden="true">
                      {seatPips(tier).map((filled, index) => (
                        <span
                          key={index}
                          className={`w-1.5 h-1.5 rounded-full ${
                            filled ? "bg-(--color-highlight-text)" : "bg-(--color-border-strong)"
                          }`}
                        />
                      ))}
                    </span>
                    <span className="text-[11px] text-(--color-text-muted) tabular-nums">
                      {seated} of {needed} seated
                    </span>
                    {waiting.length > 0 && (
                      <span className="ml-auto">
                        <PlayerFaces players={waiting} size="w-5 h-5" />
                      </span>
                    )}
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
                      title={format.draws_multiplier ? "Every multiplier and its odds" : "How the pot is split"}
                      className="px-2 py-2 rounded text-[11px] font-semibold
                                 text-(--color-text-muted) hover:text-(--color-silver) transition-colors"
                      onClick={() => setOddsOpen(oddsOpen === detailKey ? null : detailKey)}
                    >
                      {oddsOpen === detailKey ? "Hide" : "Details"}
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
