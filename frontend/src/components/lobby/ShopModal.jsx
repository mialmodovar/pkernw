import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import Icon from "../icons/Icon";
import Avatar from "../Avatar";
import useAuthStore from "../../store/authStore";
import useWalletStore from "../../store/walletStore";
import { SHELVES, alreadyYours, describe, leftToBuy, shelf } from "./shopShelf";

/**
 * What coins buy. Throwables, for now.
 *
 * A grid rather than a list. It was one row per item with a price on the end,
 * which reads well for eight things and became a scroll of seventeen
 * near-identical rows — nobody could see two prices at once, which is the only
 * way a price is read. The tiles are for finding a thing; the line underneath
 * is for reading about the one you picked, and it is also where the effects
 * finally get described. Until now the only way to learn what a bucket of water
 * did to somebody was to buy one and throw it.
 *
 * Through a portal: it is opened from inside a .panel, and a .panel carries a
 * backdrop-filter, which makes a stacking context nothing climbs out of. See
 * the note in index.css.
 */
export default function ShopModal({ onClose }) {
  const { balance, items, loading, error, fetchShop, buy, wearBorder } = useWalletStore();
  const user = useAuthStore((one) => one.user);
  const [tab, setTab] = useState("throwable");
  const [picked, setPicked] = useState(null);
  const worn = user?.profile?.avatar_border || "";

  useEffect(() => { fetchShop(); }, [fetchShop]);

  useEffect(() => {
    const key = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const forSale = shelf(items, tab);
  const free = tab === "throwable" ? alreadyYours(items) : [];
  const selected = forSale.find((row) => row.item === picked) || null;
  const detail = describe(selected, balance);
  const borders = tab === "border";

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="panel rounded-xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl shadow-black/70"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-(--color-border)">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-(--color-silver)">Shop</h2>
            <p className="flex items-center gap-1 text-xs text-(--color-text-muted) tabular-nums">
              <Icon name="coin" className="w-3 h-3" />
              {(balance ?? 0).toLocaleString()}
              {items.length > 0 && (
                <span className="ml-1">· {leftToBuy(items)} left to collect</span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn-secondary px-3 py-1 rounded text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>

        {/* Two shelves. Throwables first: they are what the shop was, and what
            somebody opening it from a table is nearly always after. */}
        <div className="flex items-center gap-1 px-3 pt-3">
          {SHELVES.map((one) => (
            <button
              key={one.key}
              type="button"
              onClick={() => { setTab(one.key); setPicked(null); }}
              aria-pressed={tab === one.key}
              title={one.blurb}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                tab === one.key
                  ? "bg-(--color-accent) text-(--color-accent-text)"
                  : "text-(--color-text-muted) hover:text-(--color-silver)"
              }`}
            >
              {one.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {error && <p className="text-sm text-[#c76b7a]">{error}</p>}
          {loading && items.length === 0 && (
            <p className="text-sm text-(--color-text-muted)">Loading…</p>
          )}

          {/* Cheapest first, and never reordered by what you can afford: a
              shelf that reshuffles itself is one you have to learn twice. */}
          <div className="grid grid-cols-5 gap-1.5">
            {forSale.map((row) => {
              const affordable = (balance ?? 0) >= row.price;
              const chosen = picked === row.item;
              return (
                <button
                  key={row.item}
                  type="button"
                  onClick={() => setPicked(chosen ? null : row.item)}
                  title={row.look.label}
                  aria-pressed={chosen}
                  className={`relative aspect-square rounded-lg border flex flex-col items-center
                              justify-center gap-0.5 transition-colors ${
                    chosen
                      ? "border-(--color-highlight-text) bg-black/50"
                      : "border-(--color-border) panel-raised hover:border-(--color-border-strong)"
                  } ${row.owned || affordable ? "" : "opacity-45"}`}
                >
                  {borders ? (
                    <Avatar
                      url={user?.profile?.avatar_url}
                      emoji={user?.profile?.avatar_emoji}
                      border={row.item}
                      name={row.look.label}
                      className="w-8 h-8 rounded-full"
                      emojiClassName="text-base"
                      ringWidth={2}
                    />
                  ) : (
                    <span className="text-xl leading-none">{row.look.glyph}</span>
                  )}
                  {row.owned ? (
                    <Icon name="check" className="w-3 h-3 text-(--color-highlight-text)" />
                  ) : (
                    <span className="text-[10px] font-semibold tabular-nums text-(--color-text-muted)">
                      {row.price}
                    </span>
                  )}
                </button>
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
              <div className="flex flex-wrap gap-1">
                {free.map((row) => (
                  <span
                    key={row.item}
                    title={row.look.label}
                    className="panel-raised rounded px-1.5 py-0.5 text-base leading-none"
                  >
                    {row.look.glyph}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* One line about whichever tile is chosen, and the till. Fixed to the
            bottom so the grid above it never moves as you look around. */}
        <div className="border-t border-(--color-border) px-4 py-3 min-h-[3.75rem] flex items-center gap-3">
          {detail ? (
            <>
              {borders ? (
                <Avatar
                  url={user?.profile?.avatar_url}
                  emoji={user?.profile?.avatar_emoji}
                  border={selected.item}
                  name={detail.label}
                  className="w-9 h-9 rounded-full shrink-0"
                  emojiClassName="text-lg"
                  ringWidth={2}
                />
              ) : (
                <span className="text-2xl leading-none shrink-0">{selected.look.glyph}</span>
              )}
              <span className="min-w-0 flex flex-col leading-tight">
                <span className="text-sm font-semibold text-(--color-silver) truncate">
                  {detail.label}
                </span>
                <span className="text-[11px] text-(--color-text-muted) truncate">
                  {detail.blurb}
                </span>
              </span>
              {detail.owned && borders ? (
                <button
                  onClick={() => wearBorder(worn === selected.item ? "" : selected.item)}
                  className={`ml-auto shrink-0 px-3 py-1.5 rounded text-xs font-semibold ${
                    worn === selected.item ? "btn-secondary" : "btn-accent"
                  }`}
                >
                  {worn === selected.item ? "Take off" : "Wear"}
                </button>
              ) : detail.owned ? (
                <span className="ml-auto text-xs font-semibold text-(--color-highlight-text)">
                  Yours
                </span>
              ) : (
                <button
                  onClick={() => buy(selected.item, tab)}
                  disabled={!detail.affordable}
                  title={detail.affordable
                    ? `Buy for ${detail.price} coins`
                    : "Not enough coins yet"}
                  className={`ml-auto shrink-0 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                    detail.affordable ? "btn-accent" : "btn-secondary opacity-50 cursor-not-allowed"
                  }`}
                >
                  <span className="flex items-center gap-1 tabular-nums">
                    <Icon name="coin" className="w-3 h-3" />
                    {detail.price}
                  </span>
                </button>
              )}
            </>
          ) : (
            <p className="text-xs text-(--color-text-muted)">
              {borders
                ? "Pick one to see it on your own face."
                : "Pick one to see what it does when it lands."}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
