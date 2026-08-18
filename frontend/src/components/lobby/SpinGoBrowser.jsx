import { useState } from "react";

import useSpinGoStore from "../../store/spinGoStore";
import useWalletStore from "../../store/walletStore";
import PlayerFaces from "./PlayerFaces";
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
  const { tiers, myGame, loading, error, sit, leave, sitting } = useSpinGoStore();
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
                  onClick={() => {
                    if (action.kind === "leave") return leave();
                    if (action.kind === "open") return onOpenTable?.(myGame.id);
                    return sit(tier.stake);
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
    </div>
  );
}
