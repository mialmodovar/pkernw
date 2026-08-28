import { useEffect } from "react";

import Icon from "../icons/Icon";
import BlackjackTable from "./BlackjackTable";
import { drawerVisible } from "./blackjack";

/**
 * Blackjack, over the felt, for the hand you are not in.
 *
 * Folding is the dullest thing that happens at a poker table: you are still
 * there, still waiting, and now with nothing to think about. The side bet gives
 * you something to be right about; this gives you something to play.
 *
 * It is the same round as the Casino tab, because the round lives on the server
 * — you can deal a hand here, close it, and find it waiting in the lobby. That
 * is also what makes the rule below safe.
 *
 * ## The rule that matters
 *
 * Poker is the game. Blackjack is the waiting. So the moment the table needs
 * you, this gets out of the way on its own — no confirmation, no "are you
 * sure", because a dialog asking permission to show you your own hand is worse
 * than the thing it is asking about. Nothing is lost by it closing: an
 * unfinished blackjack hand is on the server and is still there when you fold
 * again.
 *
 * The alternative — leaving it up, or asking first — is what would make this
 * feature a trap. A player who misses a decision at a money table because a
 * card game was covering it will not open this twice.
 */
export default function BlackjackDrawer({ open, isMyTurn, onClose }) {
  // Your turn. Out of the way, immediately.
  useEffect(() => {
    if (open && isMyTurn) onClose();
  }, [open, isMyTurn, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const key = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, onClose]);

  // The rule itself lives in blackjack.js, where it is tested. A guarantee this
  // load-bearing should not be a condition somebody can quietly widen here.
  if (!drawerVisible({ open, isMyTurn })) return null;

  return (
    // Inside the table area rather than over the whole page: on a phone the
    // action band lives below the felt, and a sheet that covered it would hide
    // the buttons for the hand this is supposed to be keeping you company
    // during. It sits on the felt and nowhere else.
    <div className="absolute inset-0 z-30 flex items-center justify-center p-2 sm:p-4
                    bg-black/70 animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Blackjack"
        className="panel rounded-xl w-full max-w-md max-h-full overflow-y-auto
                   shadow-2xl shadow-black/70"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2
                        border-b border-(--color-border)">
          <span className="flex items-center gap-2 text-xs font-bold uppercase
                           tracking-wider text-(--color-silver)">
            <Icon name="casino" className="w-4 h-4" tone="gold" />
            Blackjack
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to the table"
            className="p-1 rounded text-(--color-text-muted) hover:text-(--color-silver)
                       transition-colors"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3">
          <BlackjackTable compact onClose={onClose} />
        </div>
      </div>
    </div>
  );
}
