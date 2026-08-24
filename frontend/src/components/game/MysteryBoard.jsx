import { useState } from "react";

import useGameStore from "../../store/gameStore";
import { envelopeRows } from "./mysteryEnvelopes";
import { useBountyMoney } from "./useBountyMoney";

/**
 * What is still in the pool, in the corner, all game.
 *
 * The opening overlay is a moment; this is the reminder. Two numbers on the
 * outside, because they are the two anybody asks at a glance: how much is left
 * to be drawn, and how big the best envelope still on the board is.
 *
 * And the board itself behind them. That was the part missing: once the
 * envelopes opened, the table could see how many were left and never which
 * ones — so the question a mystery bounty tournament is actually played on,
 * "is the big one still out there", had no answer on screen. The amounts are
 * not secret; they were read out to everybody the moment the pool was cut.
 */
export default function MysteryBoard({ compact }) {
  const mystery = useGameStore((s) => s.mystery);
  const money = useBountyMoney();
  // Open where there is room for it. The complaint this answers was that the
  // board was not visible, and a list behind a press nobody knows about is not
  // visible either. A phone keeps the pill, because the list there would be a
  // corner of the felt.
  const [open, setOpen] = useState(!compact);
  if (!mystery?.opened || !mystery.envelopesLeft) return null;

  const rows = envelopeRows(mystery.envelopes, mystery.drawn);

  return (
    <div className={`absolute left-2 z-10 ${compact ? "top-2" : "top-3"}`}>
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        title={rows.length
          ? "Every envelope, and which have gone"
          : `${mystery.envelopesLeft} mystery envelopes left, biggest ${money(mystery.topLeftCents)}`}
        className={`flex items-center gap-2 rounded-full border
                    border-[rgb(var(--highlight-rgb)/0.45)] bg-[rgba(12,7,18,0.72)] px-3 py-1
                    transition-colors hover:border-(--color-highlight)
                    ${compact ? "text-[10px]" : "text-xs"}`}
      >
        <span aria-hidden="true">✉️</span>
        <span className="text-(--color-text-muted) tabular-nums">
          {mystery.envelopesLeft} left
        </span>
        <span className="text-(--color-text-muted)">·</span>
        <span className="font-semibold text-(--color-highlight-text) tabular-nums">
          {money(mystery.topLeftCents)} top
        </span>
      </button>

      {/* Biggest first and never re-sorted, so the list reads the same twice —
          see mysteryEnvelopes.js. A drawn envelope stays in its place, struck
          through: where the big ones went is as much of the picture as what is
          left. */}
      {open && rows.length > 0 && (
        <ul className={`mt-1 max-h-[14rem] overflow-y-auto rounded-lg border
                        border-[rgb(var(--highlight-rgb)/0.45)] bg-[rgba(12,7,18,0.92)]
                        py-1 ${compact ? "text-[10px] min-w-[7rem]" : "text-xs min-w-[8rem]"}`}>
          {rows.map((row, index) => (
            <li
              key={index}
              className={`flex items-center gap-2 px-2.5 py-0.5 tabular-nums ${
                row.taken
                  ? "text-(--color-text-muted) line-through decoration-(--color-text-muted)"
                  : "text-(--color-highlight-text) font-semibold"
              }`}
            >
              <span aria-hidden="true" className={row.taken ? "opacity-40" : ""}>
                ✉
              </span>
              <span>{money(row.amount)}</span>
              {row.taken && (
                <span className="ml-auto text-[9px] uppercase tracking-wide no-underline">
                  gone
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
