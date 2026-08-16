import { useEffect, useRef, useState } from "react";

import { QUICK_MESSAGES, sendQuickMessage } from "./quickMessages";

/**
 * Say something from your own seat, without going anywhere else for it.
 *
 * It sits beside your cards because that is where you are already looking when
 * there is something to say — the hand just ended, or it just ended you. The
 * chat panel is still there for anything longer; this is for the eight things
 * that are always the same eight things.
 *
 * What you pick goes up as a bubble over your own face, where everybody else's
 * words come from too — the button is where you say it, the avatar is who said
 * it, and only one of those is worth pointing at.
 */
export default function SeatQuickChat() {
  const [open, setOpen] = useState(false);
  const wrapper = useRef(null);

  // Anywhere else on the table dismisses it. Without this the list sits open
  // over your own cards while you are trying to read them.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (!wrapper.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const say = (text) => {
    sendQuickMessage(text);
    setOpen(false);
  };

  return (
    <span ref={wrapper} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        title="Say something"
        aria-label="Say something"
        aria-expanded={open}
        className={`flex items-center justify-center rounded-full border transition-colors
                    w-[clamp(1.15rem,3cqw,1.75rem)] h-[clamp(1.15rem,3cqw,1.75rem)]
                    text-[clamp(0.6rem,1.6cqw,0.9rem)] leading-none ${
                      open
                        ? "bg-(--color-highlight) border-(--color-highlight-deeper) text-(--color-highlight-ink)"
                        : "bg-black/60 border-(--color-border) text-(--color-text-muted) hover:text-(--color-silver) hover:border-(--color-border-strong)"
                    }`}
      >
        {"\u{1F4AC}"}
      </button>

      {open && (
        // Out to the side, not upwards: above the button is where your own two
        // cards are, and a list of things to say is not worth covering them
        // with. The hero's seat is always the one at the bottom centre, so the
        // felt to its right is free.
        <span className="absolute left-full bottom-0 ml-1.5 z-40 flex flex-wrap gap-1
                         w-44 p-1.5 rounded-lg panel-raised panel-solid shadow-xl shadow-black/60 animate-fade-in">
          {QUICK_MESSAGES.map((quick) => (
            <button
              key={quick.text}
              type="button"
              title={quick.hint}
              onClick={() => say(quick.text)}
              className="btn-secondary px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors"
            >
              {quick.text}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
