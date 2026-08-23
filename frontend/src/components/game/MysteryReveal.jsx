import { useEffect, useState } from "react";

import useGameStore from "../../store/gameStore";
import { formatEuros } from "./formatMoney";
import {
  REVEAL_MAX_WAIT_MS, revealHeadline, revealHolds, revealMs, revealTone,
} from "./mysteryPrize";

/**
 * One envelope being opened.
 *
 * The knockout has already happened and the money is already theirs — this is
 * the part where they find out how much. Scaled to the draw (see mysteryPrize):
 * an ordinary envelope gets a couple of seconds, and the one everybody has been
 * chasing gets gold, a pulse, and long enough to shout about.
 *
 * It waits for the knockout GIF before it plays. Both are fired by the same
 * event, and the GIF is drawn over the top of the felt on a higher layer, so
 * the envelope — the part with the money in it — was landing underneath the
 * celebration of the thing that won it and never being seen. Taking a turn each
 * also reads better than the two competing: you did it, then here is what it
 * was worth.
 */
export default function MysteryReveal() {
  const flash = useGameStore((s) => s.bountyFlash);
  // Whether the knockout GIF is on screen. Only its presence matters, so the
  // subscription is a boolean and a new GIF object does not re-run anything.
  const finisherActive = useGameStore((s) => Boolean(s.finisher));
  const mystery = flash?.mystery || null;
  const [queued, setQueued] = useState(null);
  const [showing, setShowing] = useState(null);

  useEffect(() => {
    if (!mystery) return;
    setQueued({
      id: flash.id,
      name: flash.victimName,
      mystery,
      tone: revealTone(mystery),
      at: Date.now(),
    });
    // Keyed on the flash id: two knockouts in a row are the same object by
    // value, and the second one still has to play.
  }, [flash?.id, mystery, flash?.victimName]);

  // The queue of one, waiting for the felt to be free.
  useEffect(() => {
    if (!queued) return undefined;
    const waited = Date.now() - queued.at;
    if (!revealHolds(finisherActive, waited)) {
      setShowing(queued);
      setQueued(null);
      return undefined;
    }
    // A GIF that never clears must not swallow the envelope: this is the
    // backstop, and it fires whether or not anything else changes.
    const timer = setTimeout(() => {
      setShowing(queued);
      setQueued(null);
    }, Math.max(0, REVEAL_MAX_WAIT_MS - waited));
    return () => clearTimeout(timer);
  }, [queued, finisherActive]);

  useEffect(() => {
    if (!showing) return undefined;
    const timer = setTimeout(() => setShowing(null), revealMs(showing.tone));
    return () => clearTimeout(timer);
  }, [showing]);

  if (!showing) return null;

  const { tone } = showing;
  const jackpot = tone === "jackpot";

  return (
    // Above the knockout GIF's layer, which is what was drawing over it. The
    // felt is dimmed behind the top envelope only: that one is worth stopping
    // the table for, and the ordinary ones must not black out live play for
    // four seconds at a time.
    <div className={`absolute inset-0 z-50 flex items-center justify-center
                     pointer-events-none px-4 ${
      jackpot ? "bg-black/70 animate-mystery-scrim" : ""
    }`}>
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
