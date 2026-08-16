import { useEffect, useRef, useState } from "react";

import { QUICK_MESSAGES, REACTIONS, sendQuickMessage } from "./quickMessages";

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
 */
export default function SeatQuickChat() {
  // One at a time: both drop from the same corner and would overlap.
  const [panel, setPanel] = useState(null);
  const wrapper = useRef(null);

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

  const toggle = (which) => setPanel((current) => (current === which ? null : which));

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

      {panel && (
        // Out to the side, not upwards: above the buttons is where your own two
        // cards are, and a list of things to say is not worth covering them
        // with. The hero's seat is always the one at the bottom centre, so the
        // felt to its right is free.
        <span className={`absolute left-full bottom-0 ml-1.5 z-40 flex flex-wrap gap-1
                          p-1.5 rounded-lg panel-raised panel-solid shadow-xl shadow-black/60
                          animate-fade-in ${panel === "emoji" ? "w-36" : "w-44"}`}>
          {panel === "words"
            ? QUICK_MESSAGES.map((quick) => (
                <button
                  key={quick.text}
                  type="button"
                  title={quick.hint}
                  onClick={() => say(quick.text)}
                  className="btn-secondary px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors"
                >
                  {quick.text}
                </button>
              ))
            : REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => say(emoji)}
                  aria-label={`React ${emoji}`}
                  className="w-7 h-7 flex items-center justify-center rounded text-lg
                             hover:bg-white/10 transition-colors"
                >
                  {emoji}
                </button>
              ))}
        </span>
      )}
    </span>
  );
}
