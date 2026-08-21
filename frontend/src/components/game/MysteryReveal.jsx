import { useEffect, useState } from "react";

import useGameStore from "../../store/gameStore";
import { formatEuros } from "./formatMoney";
import { revealHeadline, revealMs, revealTone } from "./mysteryPrize";

/**
 * One envelope being opened.
 *
 * The knockout has already happened and the money is already theirs — this is
 * the part where they find out how much. Scaled to the draw (see mysteryPrize):
 * an ordinary envelope gets a couple of seconds, and the one everybody has been
 * chasing gets gold, a pulse, and long enough to shout about.
 */
export default function MysteryReveal() {
  const flash = useGameStore((s) => s.bountyFlash);
  const mystery = flash?.mystery || null;
  const [showing, setShowing] = useState(null);

  useEffect(() => {
    if (!mystery) return undefined;
    const tone = revealTone(mystery);
    setShowing({ id: flash.id, name: flash.victimName, mystery, tone });
    const timer = setTimeout(() => setShowing(null), revealMs(tone));
    return () => clearTimeout(timer);
    // Keyed on the flash id: two knockouts in a row are the same object by
    // value, and the second one still has to play.
  }, [flash?.id, mystery, flash?.victimName]);

  if (!showing) return null;

  const { tone } = showing;
  const jackpot = tone === "jackpot";

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none px-4">
      <div
        className={`rounded-2xl border px-8 py-6 text-center backdrop-blur-sm
                    animate-mystery-open ${
          jackpot
            ? "border-[rgb(var(--highlight-rgb)/0.75)] bg-[rgba(12,7,18,0.92)] animate-mystery-jackpot"
            : "border-(--color-border-strong) bg-black/80"
        }`}
      >
        {/* The flap, tearing open above the amount. */}
        <div className="flex justify-center mb-1" aria-hidden="true">
          <span className="animate-mystery-flap text-3xl leading-none">✉️</span>
        </div>

        <p className={`text-[11px] uppercase tracking-[0.25em] ${
          jackpot ? "text-(--color-highlight-text)" : "text-(--color-text-muted)"
        }`}>
          {revealHeadline(tone)}
        </p>

        <p
          className={`animate-mystery-reveal font-bold tabular-nums mt-1 ${
            jackpot ? "text-5xl text-(--color-highlight-text)" : "text-4xl text-(--color-silver)"
          }`}
          style={{ animationDelay: "260ms" }}
        >
          {formatEuros(showing.mystery.envelope_cents)}
        </p>

        <p className="text-xs text-(--color-text-muted) mt-2">
          off {showing.name}
          {showing.mystery.envelopes_left > 0 && (
            <span className="block mt-0.5 tabular-nums">
              {showing.mystery.envelopes_left} envelope
              {showing.mystery.envelopes_left === 1 ? "" : "s"} left ·
              {" "}{formatEuros(showing.mystery.top_left_cents)} biggest
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
