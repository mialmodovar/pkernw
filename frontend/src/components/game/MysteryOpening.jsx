import { useEffect, useState } from "react";

import useGameStore from "../../store/gameStore";
import { formatEuros } from "./formatMoney";

// Long enough to read the board and understand what just changed about the
// tournament, short enough that nobody is waiting on it to play a hand.
const HOLD_MS = 6000;
// The envelopes deal in one after another, like cards onto the felt.
const DEAL_STEP_MS = 90;

/**
 * The moment the mystery bounties open.
 *
 * Everybody who busted out until now was worth something and nobody knew what.
 * This is when the pool stops being a rumour: it is cut into envelopes, the
 * board goes up, and from the next hand on busting somebody means drawing one.
 * It is the single biggest change of gear a mystery tournament has, so it gets
 * the table to itself for a few seconds.
 */
export default function MysteryOpening() {
  const mystery = useGameStore((s) => s.mystery);
  const clear = useGameStore((s) => s.clearMysteryAnnouncement);
  const announcement = mystery?.announcement ?? null;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (announcement == null) return undefined;
    setDismissed(false);
    const timer = setTimeout(() => {
      setDismissed(true);
      clear();
    }, HOLD_MS);
    return () => clearTimeout(timer);
  }, [announcement, clear]);

  if (announcement == null || dismissed) return null;

  const envelopes = mystery.envelopes || [];
  const reason = mystery.reason === "reg_closed"
    ? "Registration is closed"
    : "The money is reached";

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center px-4
                 bg-black/80 text-center"
      onClick={() => { setDismissed(true); clear(); }}
    >
      <p className="text-xs uppercase tracking-[0.3em] text-(--color-text-muted)">{reason}</p>

      <div className="animate-mystery-open mt-3">
        <h2 className="text-3xl sm:text-4xl font-bold text-(--color-highlight-text)">
          Mystery bounties are open
        </h2>
        <p className="text-(--color-silver) mt-2 tabular-nums">
          {formatEuros(mystery.poolCents)} in {envelopes.length} envelope
          {envelopes.length === 1 ? "" : "s"}
        </p>
        <p className="text-(--color-text-muted) text-sm mt-1">
          Biggest: <span className="text-(--color-highlight-text) font-semibold tabular-nums">
            {formatEuros(mystery.topCents)}
          </span>
        </p>
      </div>

      {/* The board itself, dealt out one envelope at a time. Real mystery
          bounty events put this on a screen for exactly this reason: knowing
          what is still in there is most of the tension. */}
      <div className="mt-5 flex flex-wrap justify-center gap-1.5 max-w-2xl">
        {envelopes.map((amount, index) => (
          <span
            key={index}
            className={`animate-mystery-deal rounded-md px-2.5 py-1 text-xs font-semibold
                        tabular-nums border ${
              index === 0
                ? "border-[rgb(var(--highlight-rgb)/0.7)] text-(--color-highlight-text) bg-[rgba(12,7,18,0.9)]"
                : "border-(--color-border) text-(--color-silver) bg-black/40"
            }`}
            style={{ animationDelay: `${400 + index * DEAL_STEP_MS}ms` }}
          >
            {formatEuros(amount)}
          </span>
        ))}
      </div>

      <p className="text-[11px] text-(--color-text-muted) mt-6">
        Knock somebody out and one of these is yours. Tap to carry on.
      </p>
    </div>
  );
}
