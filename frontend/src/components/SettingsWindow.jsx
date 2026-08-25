import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import Icon from "./icons/Icon";
import { clampPage, swipeStep } from "./swipe";

/**
 * The shell every settings panel opens in.
 *
 * On anything with room it is a window: centred, never taller than the screen,
 * scrolling inside itself. That much was already true of the appearance
 * settings and is why they stopped falling off the bottom of short screens.
 *
 * On a phone it is a sheet instead — full width, along the bottom edge, with a
 * handle at the top of it. Not decoration: a centred card capped at 22rem on a
 * 6-inch screen wastes the width it has, which makes every swatch inside it
 * smaller than a fingertip, and it puts the whole panel at the top of the
 * screen while the thumb holding the phone is at the bottom.
 *
 * Given `pages`, it also stops being one long scroll. Everything a player can
 * change about how they look was a single column nine hundred pixels deep, so
 * finding the finishers meant scrolling past the accent, the cards and the
 * raise buttons every time. Paged, each thing is one screen: tabs to jump,
 * arrows to step, and a swipe across the panel to turn — which on a phone is
 * what a hand reaches for before it finds either.
 */
export default function SettingsWindow({
  title, onClose, onEscape, pages = null, initialPage = null, children,
}) {
  // Which page a button opened on. Read once: this is where the panel starts,
  // not where it is held — turning a page must not be undone by a re-render.
  const [page, setPage] = useState(() => {
    const found = pages?.findIndex((one) => one.key === initialPage) ?? -1;
    return found < 0 ? 0 : found;
  });
  const scroller = useRef(null);
  const tabStrip = useRef(null);
  const drag = useRef(null);

  const count = pages?.length || 0;
  const current = pages ? pages[clampPage(page, count)] : null;

  const goTo = (next) => setPage(clampPage(next, count));

  // A panel that cannot be dismissed from the keyboard is a trap. `onEscape`
  // is for a panel with layers of its own to back out of first.
  useEffect(() => {
    const back = onEscape || onClose;
    const onKey = (event) => { if (event.key === "Escape") back(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEscape, onClose]);

  // Arrow keys turn pages, unless they are being used for what they are for:
  // moving a caret, opening a select, dragging a slider.
  useEffect(() => {
    if (!count) return undefined;
    const onKey = (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const tag = event.target?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      setPage((was) => clampPage(was + (event.key === "ArrowRight" ? 1 : -1), count));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count]);

  // A new page starts at its top, and its tab comes into view. Turning to a
  // page and landing halfway down it is the part of a paged panel that makes
  // people think they have lost their place.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    tabStrip.current?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [page]);

  // Nothing scrolls behind it. On a desktop the backdrop covers the page and
  // this changes little; on a phone, dragging past the end of a sheet scrolls
  // whatever is underneath it instead, which reads as the panel coming apart.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  const onTouchStart = (event) => {
    if (!count || event.touches.length !== 1) {
      drag.current = null;
      return;
    }
    // A drag that starts on something you drag is that control's, not ours: a
    // colour slider swiped sideways must change the colour, not the page.
    const tag = event.target?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
      drag.current = null;
      return;
    }
    const touch = event.touches[0];
    drag.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = (event) => {
    const from = drag.current;
    drag.current = null;
    if (!from) return;
    const touch = event.changedTouches[0];
    const step = swipeStep({ dx: touch.clientX - from.x, dy: touch.clientY - from.y });
    if (step) goTo(page + step);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Clicking away closes it, the same as Escape. */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        ref={scroller}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="settings-window relative w-full sm:max-w-md max-h-[92dvh] sm:max-h-[88dvh]
                   overflow-y-auto overscroll-contain p-3
                   panel-raised panel-solid shadow-xl shadow-black/50 animate-fade-in
                   rounded-t-2xl sm:rounded-lg"
      >
        {/* Stays put while the rest scrolls under it: the way out of a panel,
            and the way between its pages, should not be something you have to
            scroll back up to find. */}
        <div className="sticky -top-3 z-30 -mx-3 -mt-3 mb-2 px-3 pt-3 pb-1.5
                        panel-solid border-b border-(--color-border)">
          {/* The handle. It does not drag — it says which edge this came from,
              which is the whole grammar of a sheet. Phones only; a centred
              window is not attached to an edge and would be lying. */}
          <div aria-hidden="true"
            className="sm:hidden mx-auto mb-2 h-1 w-9 rounded-full bg-white/25" />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-(--color-text-muted)">
              {title}
            </p>
            {/* Forty-four points square on a touch screen, which is the size a
                thumb actually hits. The ink stays small. */}
            <button
              type="button"
              onClick={onClose}
              title="Close"
              aria-label="Close"
              className="-mr-1 shrink-0 w-11 h-11 sm:w-7 sm:h-7 flex items-center justify-center
                         rounded text-(--color-text-muted) hover:text-(--color-silver)
                         transition-colors"
            >
              <Icon name="close" className="w-4 h-4" />
            </button>
          </div>

          {count > 1 && (
            <div className="mt-1 flex items-center gap-1">
              <PageArrow
                direction="back"
                disabled={page === 0}
                onClick={() => goTo(page - 1)}
                label={pages[page - 1]?.label}
              />
              {/* Scrolls rather than wraps or shrinks: five tabs squeezed onto
                  a phone are five labels nobody can read or hit. */}
              <div
                ref={tabStrip}
                role="tablist"
                aria-label={`${title} sections`}
                className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar"
              >
                {pages.map((one, index) => (
                  <button
                    key={one.key}
                    type="button"
                    role="tab"
                    aria-selected={index === page}
                    onClick={() => goTo(index)}
                    className={`shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-semibold
                                transition-colors ${
                      index === page
                        ? "bg-(--color-accent-soft) text-(--color-silver)"
                        : "text-(--color-text-muted) hover:text-(--color-silver)"
                    }`}
                  >
                    {one.label}
                  </button>
                ))}
              </div>
              <PageArrow
                direction="forward"
                disabled={page === count - 1}
                onClick={() => goTo(page + 1)}
                label={pages[page + 1]?.label}
              />
            </div>
          )}
        </div>

        {pages ? (
          // Keyed on the page, so turning to one starts it fresh rather than
          // fading the old one's controls into the new one's.
          <div key={current.key} role="tabpanel" aria-label={current.label}
            className="animate-fade-in">
            {current.content}
          </div>
        ) : children}
      </div>
    </div>,
    document.body,
  );
}

/** One step either way, named after the page it goes to. */
function PageArrow({ direction, disabled, onClick, label }) {
  const back = direction === "back";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label ? (back ? `Back to ${label}` : `On to ${label}`) : undefined}
      aria-label={back ? "Previous section" : "Next section"}
      className="shrink-0 w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center rounded
                 text-(--color-text-muted) hover:text-(--color-silver) transition-colors
                 disabled:opacity-25 disabled:hover:text-(--color-text-muted)"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4"
        fill="none" stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round">
        <path d={back ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
      </svg>
    </button>
  );
}
