import { useCallback, useEffect, useRef, useState } from "react";

/** A panel that sits on the felt: draggable, resizable, collapsible, lockable.
 *
 * Positions are held as an offset from one CORNER rather than as left/top, so a
 * panel parked at the bottom-right stays at the bottom-right when the table
 * grows or the window changes — which is the whole reason this exists.
 *
 * Everything is remembered per panel, because a layout you set once should not
 * have to be set again next hand. Restore puts it back where it started.
 */

const STORE_PREFIX = "poker.panel.";

function readLayout(id, fallback) {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + id);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function writeLayout(id, layout) {
  try {
    localStorage.setItem(STORE_PREFIX + id, JSON.stringify(layout));
  } catch {
    // A blocked localStorage just means the arrangement lasts the session.
  }
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

// Grab zones only — no visible grip. The cursor is the affordance, and every
// corner works, so you reach for whichever one is pointing at open space.
const CORNERS = [
  { id: "tl", className: "top-0 left-0 cursor-nwse-resize" },
  { id: "tr", className: "top-0 right-0 cursor-nesw-resize" },
  { id: "bl", className: "bottom-0 left-0 cursor-nesw-resize" },
  { id: "br", className: "bottom-0 right-0 cursor-nwse-resize" },
];

const ICON_BTN =
  "shrink-0 w-5 h-5 flex items-center justify-center rounded text-[10px] leading-none " +
  "text-(--color-text-muted) hover:text-(--color-silver) hover:bg-white/10 transition-colors";

export default function FloatingPanel({
  id,
  title,
  actions,
  badge,                     // shown in the title bar while collapsed
  expandWhen = null,         // true opens a collapsed panel, and closes it again after
  anchor = "bottom-left",    // which corner the offsets are measured from
  defaultWidth = 224,
  defaultHeight = null,      // null = size to content until the user resizes
  minWidth = 160,
  minHeight = 96,
  className = "",
  children,
}) {
  const panel = useRef(null);
  const gesture = useRef(null);
  const autoOpened = useRef(false);

  // Locked to begin with: the default arrangement is the considered one, and a
  // panel you have to deliberately unlock can't be dragged halfway across the
  // felt by a misjudged click while you are trying to act.
  const defaults = {
    dx: 8, dy: 8, w: defaultWidth, h: defaultHeight, collapsed: false, pinned: true,
  };
  const [layout, setLayout] = useState(() => readLayout(id, defaults));

  useEffect(() => { writeLayout(id, layout); }, [id, layout]);

  const fromRight = anchor.includes("right");
  const fromBottom = anchor.includes("bottom");
  // Dragging towards the anchored edge has to *reduce* the offset from it.
  const signX = fromRight ? -1 : 1;
  const signY = fromBottom ? -1 : 1;

  /** Keep the panel inside the table area — after a drag, a resize, or a window change. */
  const clampInside = useCallback((next) => {
    const node = panel.current;
    const parent = node?.offsetParent;
    if (!node || !parent) return next;
    const maxW = parent.clientWidth;
    const maxH = parent.clientHeight;
    const width = Math.min(next.w ?? node.offsetWidth, maxW);
    const height = Math.min(next.h ?? node.offsetHeight, maxH);
    return {
      ...next,
      w: width,
      h: next.h == null ? null : height,
      dx: clamp(next.dx, 0, maxW - width),
      dy: clamp(next.dy, 0, maxH - height),
    };
  }, []);

  useEffect(() => {
    const onResize = () => setLayout((current) => clampInside(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampInside]);

  // Open on cue and close again afterwards — but only undo what this opened.
  // A panel you expanded yourself stays expanded.
  useEffect(() => {
    if (expandWhen == null) return;
    setLayout((current) => {
      if (expandWhen && current.collapsed) {
        autoOpened.current = true;
        return { ...current, collapsed: false };
      }
      if (!expandWhen && autoOpened.current) {
        autoOpened.current = false;
        return { ...current, collapsed: true };
      }
      return current;
    });
  }, [expandWhen]);

  const startMove = (event) => {
    if (layout.pinned || event.target.closest("button")) return;
    gesture.current = {
      kind: "move", x: event.clientX, y: event.clientY, dx: layout.dx, dy: layout.dy,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const startResize = (corner) => (event) => {
    if (layout.pinned) return;
    const node = panel.current;
    gesture.current = {
      kind: "resize",
      corner,
      x: event.clientX,
      y: event.clientY,
      // Measured, so a content-sized panel becomes fixed-size from here on.
      left: node.offsetLeft, top: node.offsetTop,
      w: node.offsetWidth, h: node.offsetHeight,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event) => {
    const start = gesture.current;
    if (!start) return;
    const moveX = event.clientX - start.x;
    const moveY = event.clientY - start.y;

    if (start.kind === "move") {
      setLayout((current) => clampInside({
        ...current,
        dx: start.dx + signX * moveX,
        dy: start.dy + signY * moveY,
      }));
      return;
    }

    // Resize works on real edges, then converts back to the anchored offsets —
    // that way every corner behaves the way the one you grabbed should.
    const parent = panel.current?.offsetParent;
    if (!parent) return;
    const pullsLeft = start.corner.includes("l");
    const pullsTop = start.corner.includes("t");

    let w = Math.max(minWidth, pullsLeft ? start.w - moveX : start.w + moveX);
    let h = Math.max(minHeight, pullsTop ? start.h - moveY : start.h + moveY);
    let left = pullsLeft ? start.left + start.w - w : start.left;
    let top = pullsTop ? start.top + start.h - h : start.top;

    // Nothing may leave the table area, from any edge.
    if (left < 0) { w += left; left = 0; }
    if (top < 0) { h += top; top = 0; }
    w = Math.min(w, parent.clientWidth - left);
    h = Math.min(h, parent.clientHeight - top);

    setLayout((current) => ({
      ...current,
      w: Math.max(minWidth, w),
      h: Math.max(minHeight, h),
      dx: fromRight ? parent.clientWidth - (left + w) : left,
      dy: fromBottom ? parent.clientHeight - (top + h) : top,
    }));
  };

  const endGesture = (event) => {
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const set = (patch) => setLayout((current) => clampInside({ ...current, ...patch }));

  // Touching the collapse control at all hands the panel back to you: whatever
  // `expandWhen` opened is no longer ours to close again.
  const toggleCollapsed = () => {
    autoOpened.current = false;
    set({ collapsed: !layout.collapsed });
  };

  const moved = layout.dx !== defaults.dx || layout.dy !== defaults.dy
    || layout.w !== defaults.w || layout.h !== defaults.h;

  const style = {
    [fromRight ? "right" : "left"]: layout.dx,
    [fromBottom ? "bottom" : "top"]: layout.dy,
    width: layout.w,
    height: layout.collapsed ? undefined : layout.h ?? undefined,
  };

  return (
    <div
      ref={panel}
      style={style}
      className={`absolute z-20 panel panel-floating rounded-lg flex flex-col
                  shadow-lg shadow-black/50 ${className}`}
    >
      <div
        onPointerDown={startMove}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onDoubleClick={toggleCollapsed}
        title={layout.pinned ? "Locked — unlock to move" : "Drag to move; double-click to collapse"}
        className={`shrink-0 px-2 py-1.5 border-b border-(--color-border) flex items-center gap-1.5
                    select-none touch-none ${layout.pinned ? "" : "cursor-move"}`}
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-(--color-silver) truncate">
          {title}
        </h2>
        {layout.collapsed && badge}
        <div className="ml-auto flex items-center gap-1">
          {actions}
          {/* Position and size only, as it says — re-locking a panel you had
              deliberately unlocked is not something this button promises. */}
          {moved && (
            <button type="button"
              onClick={() => set({ dx: defaults.dx, dy: defaults.dy, w: defaults.w, h: defaults.h })}
              title="Restore original position and size"
              className={ICON_BTN}>
              ↺
            </button>
          )}
          <button type="button" onClick={() => set({ pinned: !layout.pinned })}
            aria-pressed={layout.pinned}
            title={layout.pinned ? "Unlock position" : "Lock position"}
            className={`${ICON_BTN} ${layout.pinned ? "text-(--color-highlight-text)" : ""}`}>
            {layout.pinned ? "\u{1F512}" : "\u{1F513}"}
          </button>
          <button type="button" onClick={toggleCollapsed}
            aria-expanded={!layout.collapsed}
            title={layout.collapsed ? "Expand" : "Collapse"}
            className={ICON_BTN}>
            {layout.collapsed ? "▸" : "▾"}
          </button>
        </div>
      </div>

      {/* Scrolls rather than clips: a panel dragged down to its minimum still
          has to give you every button in it. */}
      {!layout.collapsed && (
        <div className="flex-1 min-h-0 overflow-auto">{children}</div>
      )}

      {!layout.collapsed && !layout.pinned && CORNERS.map((corner) => (
        <div
          key={corner.id}
          onPointerDown={startResize(corner.id)}
          onPointerMove={onPointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          role="separator"
          aria-label={`Resize ${title}`}
          className={`absolute w-4 h-4 touch-none ${corner.className}`}
        />
      ))}
    </div>
  );
}
