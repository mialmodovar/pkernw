import { useEffect } from "react";
import { createPortal } from "react-dom";

import useWalletStore from "../../store/walletStore";
import { throwableFor } from "../game/throwables";

/**
 * What coins buy. Throwables, for now.
 *
 * Through a portal: it is opened from inside a .panel, and a .panel carries a
 * backdrop-filter, which makes a stacking context nothing climbs out of. See
 * the note in index.css.
 */
export default function ShopModal({ onClose }) {
  const { balance, items, loading, error, fetchShop, buy } = useWalletStore();

  useEffect(() => { fetchShop(); }, [fetchShop]);

  useEffect(() => {
    const key = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const forSale = items.filter((row) => row.price > 0);
  const free = items.filter((row) => row.price === 0);

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="panel rounded-xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl shadow-black/70"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-(--color-border)">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-(--color-silver)">Shop</h2>
            <p className="text-xs text-(--color-text-muted)">🪙 {(balance ?? 0).toLocaleString()} coins</p>
          </div>
          <button
            onClick={onClose}
            className="btn-secondary px-3 py-1 rounded text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {error && <p className="text-sm text-[#c76b7a]">{error}</p>}
          {loading && items.length === 0 && (
            <p className="text-sm text-(--color-text-muted)">Loading…</p>
          )}

          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-(--color-text-muted)">
              Throwables
            </div>
            {forSale.map((row) => {
              const look = throwableFor(row.item);
              const affordable = (balance ?? 0) >= row.price;
              return (
                <div
                  key={row.item}
                  className="flex items-center gap-3 panel-raised rounded-lg px-3 py-2"
                >
                  <span className="text-xl leading-none">{look.glyph}</span>
                  <span className="text-sm font-semibold text-(--color-silver) truncate">
                    {look.label}
                  </span>
                  {row.owned ? (
                    <span className="ml-auto text-xs font-semibold text-(--color-highlight-text)">Owned</span>
                  ) : (
                    <button
                      onClick={() => buy(row.item)}
                      disabled={!affordable}
                      title={affordable ? `Buy for ${row.price} coins` : "Not enough coins yet"}
                      className={`ml-auto px-3 py-1 rounded text-xs font-semibold transition-colors ${
                        affordable ? "btn-accent" : "btn-secondary opacity-50 cursor-not-allowed"
                      }`}
                    >
                      🪙 {row.price}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* What everybody already has, so the shop does not read as though
              the free ones had been taken away. */}
          {free.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-(--color-text-muted) mb-1">
                Yours already
              </div>
              <div className="flex flex-wrap gap-1.5">
                {free.map((row) => (
                  <span
                    key={row.item}
                    title={throwableFor(row.item).label}
                    className="panel-raised rounded-lg px-2 py-1 text-lg leading-none"
                  >
                    {throwableFor(row.item).glyph}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
