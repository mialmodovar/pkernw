import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import Icon from "../icons/Icon";
import { defaultSeat, seatOptions, suggestedBuyIn } from "./cashTables";

/**
 * Sitting down: which chair, and how much.
 *
 * Both questions at once, because they are one decision. Where you sit is who
 * acts after you and who acts before you, which at a six-handed table is most
 * of what the seat is worth — being dropped into the first free chair is fine
 * for a tournament, where the draw is the point, and wrong for a cash game,
 * where choosing your spot is part of playing.
 *
 * Through a portal for the reason every dialog here is: .panel carries a
 * backdrop-filter, and a stacking context is not something a z-index can climb
 * out of. See index.css.
 */
export default function SitDownModal({ table, balance, busy, error, onSit, onClose }) {
  const [seat, setSeat] = useState(() => defaultSeat(table));
  // The middle of the range, held rather than derived: this is a field
  // somebody types over, and one that rewrites itself mid-keystroke is
  // unusable.
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
            <h3 className="text-[11px] uppercase tracking-wider text-(--color-text-muted) mb-2">
              Take a seat
            </h3>
            <div className="grid grid-cols-3 gap-1.5">
              {chairs.map((chair) => (
                <button
                  key={chair.seat}
                  onClick={() => setSeat(chair.seat)}
                  disabled={chair.taken}
                  title={chair.taken ? `${chair.name} is sitting here` : `Sit in ${chair.label}`}
                  className={`rounded px-2 py-1.5 text-xs font-semibold leading-tight
                              transition-colors truncate ${
                    chair.taken
                      ? "panel-raised opacity-55 text-(--color-text-muted) cursor-not-allowed"
                      : seat === chair.seat
                      ? "btn-accent"
                      : "btn-secondary"
                  }`}
                >
                  <span className="block truncate">{chair.label}</span>
                  {/* A taken chair is worth more as a name than as a number:
                      who you are sitting next to is the other half of the
                      choice. */}
                  <span className="block truncate text-[10px] font-normal opacity-80">
                    {chair.taken ? chair.name : "free"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <h3 className="text-[11px] uppercase tracking-wider text-(--color-text-muted)">
                Buy in
              </h3>
              <p className="text-[11px] text-(--color-text-muted) tabular-nums">
                {table.min_buy_in}–{table.max_buy_in}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={amount}
                min={table.min_buy_in}
                max={table.max_buy_in}
                onChange={(event) => setAmount(Number(event.target.value))}
                className="input-field flex-1 text-right rounded py-1.5 px-2 font-mono text-sm"
              />
              {/* The two amounts anybody actually picks, so nobody has to do
                  the arithmetic to sit down deep or short. */}
              <button onClick={() => setAmount(low)}
                className="btn-secondary px-2 py-1.5 rounded text-[11px] font-semibold">
                Min
              </button>
              <button onClick={() => setAmount(high)}
                className="btn-secondary px-2 py-1.5 rounded text-[11px] font-semibold">
                Max
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
