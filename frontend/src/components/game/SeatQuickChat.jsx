import { useEffect, useRef, useState } from "react";
import { cooldownLabel, cooldownLeft, nextTickMs } from "./throwCooldown";

import QuickMessageList from "./QuickMessageList";
import useGameStore from "../../store/gameStore";
import { sendQuickMessage } from "./quickMessages";
import { THROWABLES, pickerOrder } from "./throwables";
import useWalletStore from "../../store/walletStore";

// The two buttons share a size and a shape; only what they open differs.
const BUTTON = `flex items-center justify-center rounded-full border transition-colors
                w-[clamp(1.15rem,3cqw,1.75rem)] h-[clamp(1.15rem,3cqw,1.75rem)]
                text-[clamp(0.6rem,1.6cqw,0.9rem)] leading-none`;

const OPEN_STYLE = "bg-(--color-highlight) border-(--color-highlight-deeper) text-(--color-highlight-ink)";
const SHUT_STYLE = "bg-black/60 border-(--color-border) text-(--color-text-muted) "
  + "hover:text-(--color-silver) hover:border-(--color-border-strong)";

/**
 * Say something from your own seat, without going anywhere else for it.
 *
 * It sits beside your cards because that is where you are already looking when
 * there is something to say — the hand just ended, or it just ended you. The
 * chat panel is still there for anything longer; this is for the eight things
 * that are always the same eight things, and for the times a face says it
 * faster than any of them.
 *
 * What you pick goes up as a bubble over your own face, where everybody else's
 * words come from too — the button is where you say it, the avatar is who said
 * it, and only one of those is worth pointing at.
 *
 * The third button throws something instead of saying it. Picking an item does
 * not throw it — it arms the table, and the next seat you click is who catches
 * it. Two steps, because "what" and "at whom" are two decisions and a menu of
 * eight items times eight players is not a menu.
 */
export default function SeatQuickChat() {
  // One at a time: they drop from the same corner and would overlap.
  const [panel, setPanel] = useState(null);
  const wrapper = useRef(null);
  const aimingItem = useGameStore((s) => s.aimingItem);
  // Three in a row and the arm is tired for ten seconds — the server's rule,
  // counted down here so the button says so rather than going quiet.
  const throwReadyAt = useGameStore((s) => s.throwReadyAt);
  const [cooling, setCooling] = useState(0);
  // What is locked is shown anyway, greyed: a shelf you cannot see is a shelf
  // nobody buys from.
  const owns = useWalletStore((s) => s.owns);
  const priceOf = useWalletStore((s) => s.priceOf);
  const onSale = useWalletStore((s) => s.onSale);
  const balance = useWalletStore((s) => s.balance);
  const buyItem = useWalletStore((s) => s.buy);
  const setAiming = useGameStore((s) => s.setAiming);
  const setSeatPanelOpen = useGameStore((s) => s.setSeatPanelOpen);
  // The locked one you have asked the price of, and how that went.
  const [buying, setBuying] = useState(null);
  const [buyError, setBuyError] = useState("");
  const [busy, setBusy] = useState(false);
  const buyingItem = buying ? THROWABLES.find((one) => one.id === buying) : null;

  // The table lifts this seat over its neighbours while a panel is open. It
  // cannot be done from in here: the seat is translated into place and that
  // makes it a stacking context, so the panel was opening under the seat next
  // door however high its own z-index went.
  useEffect(() => {
    setSeatPanelOpen(Boolean(panel));
    return () => setSeatPanelOpen(false);
  }, [panel, setSeatPanelOpen]);

  // Anywhere else on the table dismisses it. Without this the list sits open
  // over your own cards while you are trying to read them.
  useEffect(() => {
    if (!panel) return undefined;
    const onDown = (event) => {
      if (!wrapper.current?.contains(event.target)) setPanel(null);
    };
    const onKey = (event) => { if (event.key === "Escape") setPanel(null); };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [panel]);

  const say = (text) => {
    sendQuickMessage(text);
    setPanel(null);
  };

  // Armed and then thought better of it. Escape is where anybody reaches, and
  // without it the only way out is to click the button again — while every
  // seat on the table is wearing a crosshair.
  useEffect(() => {
    if (!aimingItem) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setAiming(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aimingItem, setAiming]);

  // Ticked to the next whole second rather than on an interval, so the number
  // changes when it is due to rather than up to a second late.
  useEffect(() => {
    const left = cooldownLeft(throwReadyAt, Date.now());
    setCooling(left);
    if (!left) return undefined;
    const timer = setTimeout(
      () => setCooling(cooldownLeft(throwReadyAt, Date.now())),
      nextTickMs(throwReadyAt, Date.now()) ?? 1000,
    );
    return () => clearTimeout(timer);
  }, [throwReadyAt, cooling]);

  const toggle = (which) => setPanel((current) => (current === which ? null : which));

  const arm = (item) => {
    setAiming(item);
    setPanel(null);
  };

  // Bought and straight into your hand: you were not shopping, you were trying
  // to throw something at somebody, and the hand you wanted it for is still on.
  const confirmBuy = async () => {
    if (!buying) return;
    setBusy(true);
    setBuyError("");
    const bought = await buyItem(buying);
    setBusy(false);
    if (!bought) {
      setBuyError(useWalletStore.getState().error || "That purchase did not go through.");
      return;
    }
    setBuying(null);
    arm(buying);
  };

  // A panel that closes takes the half-finished purchase with it, rather than
  // reopening later with a "Buy 300" you have forgotten agreeing to look at.
  useEffect(() => {
    if (!panel) { setBuying(null); setBuyError(""); }
  }, [panel]);

  return (
    // Stacked rather than side by side: the room beside your cards is one
    // button wide, and the felt above it is empty.
    <span ref={wrapper} className="relative shrink-0 flex flex-col-reverse gap-1">
      <button
        type="button"
        onClick={() => toggle("words")}
        title="Say something"
        aria-label="Say something"
        aria-expanded={panel === "words"}
        className={`${BUTTON} ${panel === "words" ? OPEN_STYLE : SHUT_STYLE}`}
      >
        {"\u{1F4AC}"}
      </button>

      <button
        type="button"
        onClick={() => toggle("emoji")}
        title="React"
        aria-label="React"
        aria-expanded={panel === "emoji"}
        className={`${BUTTON} ${panel === "emoji" ? OPEN_STYLE : SHUT_STYLE}`}
      >
        {"\u{1F642}"}
      </button>

      <button
        type="button"
        disabled={cooling > 0}
        onClick={() => (aimingItem ? setAiming(null) : toggle("throw"))}
        title={cooling > 0
          ? `Your arm is tired — ${cooling}s`
          : aimingItem ? "Pick a seat, or click here to put it down" : "Throw something"}
        aria-label="Throw something"
        aria-expanded={panel === "throw"}
        className={`${BUTTON} ${
          cooling > 0
            ? "opacity-50 cursor-not-allowed tabular-nums text-[11px] font-bold"
            : panel === "throw" || aimingItem ? OPEN_STYLE : SHUT_STYLE
        }`}
      >
        {cooling > 0
          ? cooldownLabel(cooling)
          : aimingItem ? "\u{1F3AF}" : "\u{1F345}"}
      </button>

      {panel === "throw" && (
        <span className="absolute left-full bottom-0 ml-1.5 z-40 w-52 p-1.5 flex flex-wrap gap-1
                         rounded-lg panel-raised panel-solid shadow-xl shadow-black/60 animate-fade-in">
          {/* What the server actually sells, in the order this client draws
              them. A build that knows about an item the server has never heard
              of would otherwise offer it and have every throw silently
              refused; before the shop has been read once, everything shows,
              which is what it did before any of it could be bought. */}
          {pickerOrder(owns).filter((item) => onSale(item.id)).map((item) => {
            const owned = owns(item.id);
            const price = priceOf(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => (owned ? arm(item.id) : setBuying(item.id))}
                title={owned
                  ? `Throw a ${item.label.toLowerCase()}`
                  : `${item.label} — ${price} coins`}
                className={`relative w-8 h-8 flex items-center justify-center rounded text-lg
                            transition-colors hover:bg-white/10 ${
                  owned ? "" : "opacity-45 grayscale hover:opacity-100 hover:grayscale-0"
                } ${buying === item.id ? "ring-1 ring-(--color-highlight)" : ""}`}
              >
                {item.glyph}
                {/* The price, on the thing itself. A locked shelf that does not
                    say what anything costs is a shelf you walk past. */}
                {!owned && (
                  <span className="absolute -bottom-0.5 right-0 px-0.5 rounded-sm bg-black/80
                                   text-[8px] font-bold leading-tight text-(--color-highlight-text)">
                    {price}
                  </span>
                )}
              </button>
            );
          })}

          {/* Buying one where you wanted it, rather than leaving the table for
              the lobby shop and coming back to a hand that has moved on. Two
              steps on purpose: the first names the price, the second spends. */}
          {buyingItem && (
            <span className="w-full mt-1 pt-1.5 border-t border-(--color-border) flex flex-col gap-1">
              <span className="flex items-center justify-between gap-1 text-[10px] text-(--color-silver)">
                <span className="truncate">{buyingItem.glyph} {buyingItem.label}</span>
                <span className="text-(--color-text-muted) shrink-0">
                  you have {balance ?? "…"}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={confirmBuy}
                  disabled={busy || (balance != null && balance < priceOf(buyingItem.id))}
                  className="btn-accent flex-1 px-2 py-1 rounded text-[11px] font-bold transition-colors
                             disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy ? "Buying…" : `Buy ${priceOf(buyingItem.id)}`}
                </button>
                <button
                  type="button"
                  onClick={() => { setBuying(null); setBuyError(""); }}
                  aria-label="Cancel"
                  className="px-1.5 py-1 rounded text-[11px] text-(--color-text-muted)
                             hover:text-(--color-silver) transition-colors"
                >
                  ✕
                </button>
              </span>
              {(buyError || (balance != null && balance < priceOf(buyingItem.id))) && (
                <span className="text-[10px] leading-snug text-[#c76b7a]">
                  {buyError || "Not enough coins — claim today's in the lobby."}
                </span>
              )}
            </span>
          )}
        </span>
      )}

      {panel && panel !== "throw" && (
        // Out to the side, not upwards: above the buttons is where your own two
        // cards are, and a list of things to say is not worth covering them
        // with. The hero's seat is always the one at the bottom centre, so the
        // felt to its right is free.
        <QuickMessageList
          kind={panel === "emoji" ? "reactions" : "words"}
          onPick={say}
          className="absolute left-full bottom-0 ml-1.5 z-40"
        />
      )}
    </span>
  );
}
