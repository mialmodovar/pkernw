import useGameStore from "../../store/gameStore";
import { formatEuros } from "./formatMoney";

/**
 * What is still in the pool, in the corner, all game.
 *
 * The opening overlay is a moment; this is the reminder. Two numbers, because
 * they are the two anybody actually asks: how much is left to be drawn, and how
 * big the best envelope still on the board is.
 */
export default function MysteryBoard({ compact }) {
  const mystery = useGameStore((s) => s.mystery);
  if (!mystery?.opened || !mystery.envelopesLeft) return null;

  return (
    <div
      title={`${mystery.envelopesLeft} mystery envelopes left, biggest ${formatEuros(mystery.topLeftCents)}`}
      className={`absolute left-2 z-10 pointer-events-none flex items-center gap-2
                  rounded-full border border-[rgb(var(--highlight-rgb)/0.45)]
                  bg-[rgba(12,7,18,0.72)] px-3 py-1
                  ${compact ? "top-2 text-[10px]" : "top-3 text-xs"}`}
    >
      <span aria-hidden="true">✉️</span>
      <span className="text-(--color-text-muted) tabular-nums">
        {mystery.envelopesLeft} left
      </span>
      <span className="text-(--color-text-muted)">·</span>
      <span className="font-semibold text-(--color-highlight-text) tabular-nums">
        {formatEuros(mystery.topLeftCents)} top
      </span>
    </div>
  );
}
