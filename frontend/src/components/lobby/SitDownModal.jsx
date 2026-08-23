import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import Avatar from "../Avatar";
import Icon from "../icons/Icon";
import { pointAt } from "../game/tableSeats";
import { defaultSeat, seatOptions, suggestedBuyIn } from "./cashTables";

// The felt in the picker: a wide, shallow oval, and the seats laid on it with
// the ring the real table uses. Not the phone geometry and not the desktop one
// — this is a picture of a table rather than a table, and it is always this
// shape whatever the player is looking at it on.
const PREVIEW = { radiusX: 42, radiusY: 40, power: 0.85 };

/**
 * Sitting down: which chair, and how much.
 *
 * Both questions at once, because they are one decision. Where you sit is who
 * acts after you and who acts before you, which at a six-handed table is most
 * of what the seat is worth — being dropped into the first free chair is fine
 * for a tournament, where the draw is the point, and wrong for a cash game,
 * where choosing your spot is part of playing.
 *
 * Drawn as the table rather than listed as a row of buttons: "seat 4" means
 * nothing until you can see that it is the one between two of the three people
 * already sitting there, and their faces are the other half of the choice.
 *
 * Through a portal for the reason every dialog here is: .panel carries a
 * backdrop-filter, and a stacking context is not something a z-index can climb
 * out of. See index.css.
 */
export default function SitDownModal({ table, balance, busy, error, onSit, onClose }) {
  const [seat, setSeat] = useState(() => defaultSeat(table));
  // The middle of the range, held rather than derived: this is a control
  // somebody drags, and one that rewrites itself mid-drag is unusable.
  const [amount, setAmount] = useState(() => suggestedBuyIn(table, balance));

  useEffect(() => {
    const key = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const chairs = seatOptions(table);
  const low = table.min_buy_in || 0;
  const high = Math.min(table.max_buy_in || 0, balance ?? 0);
  const tooMuch = amount > (balance ?? 0);
  const outOfRange = amount < low || amount > (table.max_buy_in || 0);
  const bb = table.big_blind || 0;
  const chosen = chairs.find((one) => one.seat === seat) || null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="panel rounded-xl w-full max-w-md shadow-2xl shadow-black/70"
        onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-4 py-3
                        border-b border-(--color-border)">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-(--color-highlight-text) truncate">
              {table.name}
            </h2>
            <p className="text-xs text-(--color-text-muted) tabular-nums">
              {table.stake_label} · {table.taken}/{table.seats} seated
            </p>
          </div>
          <button onClick={onClose}
            className="btn-secondary shrink-0 px-3 py-1 rounded text-xs font-semibold">
            Close
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-[11px] uppercase tracking-wider text-(--color-text-muted)">
                Take a seat
              </h3>
              <p className="text-[11px] text-(--color-silver) truncate max-w-[60%]">
                {chosen ? (chosen.taken ? chosen.name : chosen.label) : "No seat free"}
              </p>
            </div>

            {/* The table, seen from above. */}
            <div className="relative w-full aspect-[16/9] rounded-[42%/34%]
                            bg-[radial-gradient(ellipse_at_center,rgba(90,20,32,0.55),rgba(20,10,16,0.9))]
                            border border-(--color-border-strong)">
              {chairs.map((chair) => {
                const at = pointAt(chair.seat, chairs.length, 1, PREVIEW);
                const picked = seat === chair.seat;
                return (
                  <button
                    key={chair.seat}
                    onClick={() => !chair.taken && setSeat(chair.seat)}
                    disabled={chair.taken}
                    title={chair.taken
                      ? `${chair.name} is sitting here`
                      : `Sit in ${chair.label}`}
                    style={{ left: at.left, top: at.top }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full
                                flex items-center justify-center transition-all ${
                      chair.taken
                        ? "cursor-not-allowed"
                        : picked
                        ? "ring-2 ring-(--color-highlight) scale-110 bg-(--color-accent)"
                        : "border border-dashed border-(--color-border-strong) hover:border-(--color-highlight)"
                    }`}
                  >
                    {chair.taken ? (
                      <Avatar
                        url={chair.avatar?.avatar_url}
                        emoji={chair.avatar?.avatar_emoji}
                        border={chair.avatar?.avatar_border}
                        name={chair.name}
                        className="w-full h-full"
                        emojiClassName="text-[1rem]"
                      />
                    ) : (
                      <span className={`text-[10px] font-bold ${
                        picked ? "text-(--color-accent-text)" : "text-(--color-text-muted)"
                      }`}>
                        {chair.seat + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <h3 className="text-[11px] uppercase tracking-wider text-(--color-text-muted)">
                Buy in
              </h3>
              {/* What the number actually means at this table. A stack is only
                  ever read in blinds once you are sitting behind it. */}
              <p className="text-xs font-bold tabular-nums text-(--color-highlight-text)">
                {amount}
                {bb > 0 && (
                  <span className="ml-1.5 font-semibold text-(--color-text-muted)">
                    {Math.round(amount / bb)} BB
                  </span>
                )}
              </p>
            </div>

            <input
              type="range"
              min={low}
              max={table.max_buy_in || low}
              step={Math.max(1, bb)}
              value={Math.min(Math.max(amount, low), table.max_buy_in || low)}
              onChange={(event) => setAmount(Number(event.target.value))}
              className="w-full h-6 accent-(--color-highlight-bright) cursor-pointer
                         touch-manipulation"
            />
            <div className="flex items-center justify-between text-[11px] tabular-nums">
              <button onClick={() => setAmount(low)}
                className="text-(--color-text-muted) hover:text-(--color-silver) transition-colors">
                {low} min
              </button>
              {/* The most this player can actually bring, which is not always
                  the table maximum. */}
              <button onClick={() => setAmount(high)}
                className="text-(--color-text-muted) hover:text-(--color-silver) transition-colors">
                {high} max
              </button>
            </div>

            <p className="mt-1.5 text-[11px] text-(--color-text-muted) flex items-center gap-1">
              <Icon name="coin" className="w-3 h-3" />
              <span className="tabular-nums">{(balance ?? 0).toLocaleString()}</span>
              <span>in your wallet</span>
            </p>
          </div>

          {(error || tooMuch || outOfRange) && (
            <p className="text-xs text-[#c76b7a]">
              {error
                || (tooMuch ? "That is more than you have." : "That is outside what this table takes.")}
            </p>
          )}

          <button
            onClick={() => onSit(amount, seat)}
            disabled={busy || seat == null || tooMuch || outOfRange}
            className="btn-accent w-full py-2 rounded text-sm font-semibold disabled:opacity-50"
          >
            {busy
              ? "Sitting down…"
              : seat == null
              ? "No seat free"
              : `Sit in seat ${seat + 1} for ${amount}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
