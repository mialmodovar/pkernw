import { useEffect, useRef, useState } from "react";

import QuickMessageList from "./QuickMessageList";
import useGameStore from "../../store/gameStore";
import { sendQuickMessage } from "./quickMessages";
import { THROWABLES } from "./throwables";

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
  const setAiming = useGameStore((s) => s.setAiming);

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

  const toggle = (which) => setPanel((current) => (current === which ? null : which));

  const arm = (item) => {
    setAiming(item);
    setPanel(null);
  };

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
        onClick={() => (aimingItem ? setAiming(null) : toggle("throw"))}
        title={aimingItem ? "Pick a seat, or click here to put it down" : "Throw something"}
        aria-label="Throw something"
        aria-expanded={panel === "throw"}
        className={`${BUTTON} ${panel === "throw" || aimingItem ? OPEN_STYLE : SHUT_STYLE}`}
      >
        {aimingItem ? "\u{1F3AF}" : "\u{1F345}"}
      </button>

      {panel === "throw" && (
        <span className="absolute left-full bottom-0 ml-1.5 z-40 w-40 p-1.5 flex flex-wrap gap-1
                         rounded-lg panel-raised panel-solid shadow-xl shadow-black/60 animate-fade-in">
          {THROWABLES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => arm(item.id)}
              title={`Throw a ${item.label.toLowerCase()}`}
              className="w-8 h-8 flex items-center justify-center rounded text-lg
                         hover:bg-white/10 transition-colors"
            >
              {item.glyph}
            </button>
          ))}
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
