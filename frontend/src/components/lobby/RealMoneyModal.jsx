import { useEffect } from "react";
import { createPortal } from "react-dom";

import Icon from "../icons/Icon";
import { realMoneyEntry } from "./buyIn";

/**
 * Saying out loud that a seat costs actual money.
 *
 * Almost everything in this app is played for coins, which are the app's own
 * currency and cost nobody anything. A euro tournament is the exception, and it
 * looked exactly like the rest: the same Join button, the same one click, and
 * the only thing telling you apart was a small figure with a € on it that a
 * player scanning a list has no reason to read differently from a figure with a
 * chip on it.
 *
 * So the two kinds of game part company at the one moment it matters. This is a
 * confirmation rather than a warning — nothing here is dangerous, and a dialog
 * that scolds somebody for joining their own friends' game would be worse than
 * no dialog. It says the price, says who moves the money, and gets out of the
 * way.
 *
 * The part worth being exact about is the second line. This app does not take
 * the money, hold it, or pay it out: it writes down what was agreed and shows
 * the total in Calotes at the end. Somebody who joins believing the app has
 * their twenty euros has misunderstood the whole thing, and this is the last
 * moment anybody can tell them.
 *
 * Through a portal for the reason every dialog here is: .panel carries a
 * backdrop-filter, and a stacking context is not something a z-index can climb
 * out of. See index.css.
 */
export default function RealMoneyModal({ tournament, busy, onConfirm, onClose }) {
  useEffect(() => {
    const key = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  if (!tournament) return null;
  const { cost, bounty } = realMoneyEntry(tournament);

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="real-money-title"
        className="panel rounded-xl w-full max-w-sm shadow-2xl shadow-black/70"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4 space-y-4">
          <div className="flex items-start gap-3">
            <Icon name="ledger" className="w-7 h-7 shrink-0 mt-0.5" tone="gold" />
            <div className="min-w-0">
              <h2 id="real-money-title" className="text-base font-bold text-(--color-highlight-text)">
                This one is played for money
              </h2>
              {/* Which game, because a lobby can have several open and the
                  dialog arrived over whichever card was pressed. */}
              <p className="text-xs text-(--color-text-muted) truncate">{tournament.name}</p>
            </div>
          </div>

          {/* The price, big, and on its own. It is the whole reason the dialog
              exists and it should not have to be found in a sentence. */}
          <div className="flex items-baseline justify-between gap-3 px-3 py-2.5 rounded-lg
                          panel-raised">
            <span className="text-[10px] uppercase tracking-wider text-(--color-text-muted)">
              Buy-in
            </span>
            <span className="text-2xl font-bold text-(--color-silver) tabular-nums">{cost}</span>
          </div>

          {bounty && (
            // Which game they are buying into. At a knockout night most of the
            // buy-in is not playing for the places at all.
            <p className="text-xs text-(--color-text-muted) leading-snug">
              <span className="text-(--color-silver) font-semibold">{bounty}</span> of that is the
              bounty on each player, won by knocking them out rather than by placing.
            </p>
          )}

          <p className="text-sm text-(--color-silver) leading-snug">
            Real money, between you and the other players. The app does not take it, hold it, or
            pay it out — it writes down what was agreed.
          </p>

          <p className="text-xs text-(--color-text-muted) leading-snug">
            When the night is over, <span className="text-(--color-highlight-text)">Calotes</span>{" "}
            shows what you are owed or what you owe, and who to settle it with.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3
                        border-t border-(--color-border)">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-2 rounded text-sm font-semibold btn-secondary transition-colors
                       disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 rounded text-sm font-semibold btn-accent transition-colors
                       disabled:opacity-50 disabled:cursor-wait"
          >
            {/* The price again, on the button. It is the last thing read before
                the seat is taken, and "Join" alone is what this dialog exists
                to stop being the whole of it. */}
            {busy ? "Joining..." : `Join for ${cost}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
