import { useEffect, useState } from "react";

import useGameStore from "../../store/gameStore";
import { formatChips } from "./formatChips";
import { actionHoldMs, actionLabel, actionTone, isWorthShowing } from "./seatAction";

// How each tone is drawn. A fold is spent and looks it; chips going in carry
// the accent, and an all in carries the table's gold — the same money-in-the
// -middle colour the pot and the winner's badge use.
const TONES = {
  spent: "bg-black/55 border-(--color-border) text-(--color-text-muted)",
  quiet: "bg-black/70 border-(--color-border-strong) text-(--color-silver)",
  chips: "bg-(--color-accent-deep) border-(--color-accent) text-(--color-accent-text)",
  allin: "bg-[linear-gradient(135deg,var(--color-highlight-bright),var(--color-highlight-deep))]"
    + " border-(--color-highlight-deeper) text-(--color-highlight-ink)",
};

/**
 * What this seat just did, on the seat.
 *
 * Named ...Pill because its path has to differ from seatAction.js by more than
 * a capital letter — the two are the same file on a Mac, and the import
 * resolved to the wrong one.
 *
 * The lifetime is the whole of the feature: a fold clears itself after a few
 * seconds because the player is out of the hand and a seat still saying "Fold"
 * is describing somebody who left; everything else is the state of the betting
 * and stays until the street closes or that player acts again — both of which
 * clear it in the store rather than here.
 */
export default function SeatActionPill({ seat }) {
  const last = useGameStore((s) => s.lastActions[seat]) || null;
  const showBB = useGameStore((s) => s.showBB);
  const bb = useGameStore((s) => s.level?.big_blind) || 0;
  // Which fold has already had its few seconds. Held by id rather than as a
  // boolean so that folding again next hand starts a fresh one.
  const [expired, setExpired] = useState(null);

  const hold = last ? actionHoldMs(last) : null;
  const id = last?.id ?? null;

  useEffect(() => {
    if (id == null || hold == null) return undefined;
    const timer = setTimeout(() => setExpired(id), hold);
    return () => clearTimeout(timer);
  }, [id, hold]);

  if (!last || !isWorthShowing(last.action) || expired === id) return null;

  const label = actionLabel(last, (amount) => formatChips(amount, showBB, bb));
  if (!label) return null;

  return (
    <div
      // Announced, because a table read from the seats rather than from the log
      // is one a screen reader has to be told about too.
      role="status"
      className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase
                  tracking-wide leading-none whitespace-nowrap shadow shadow-black/50
                  animate-seat-action ${TONES[actionTone(last)]}`}
    >
      {label}
    </div>
  );
}
