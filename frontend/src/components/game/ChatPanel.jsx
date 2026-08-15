import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useGameStore from "../../store/gameStore";
import { send } from "../../api/socket";
import { gifPreviewUrl } from "../../api/giphy";
import GifPicker from "./GifPicker";
import MediaControls from "./MediaControls";

const MAX_CHARS = 240;

/** How much you have missed while the chat was collapsed.
 *
 * Mounted only while the panel is collapsed, so mounting IS the moment the
 * counting starts — and unmounting on expand is what clears it. Counts the
 * store's arrival sequence rather than the message array, which is capped.
 */
export function ChatUnreadBadge() {
  const sequence = useGameStore((s) => s.chatSequence);
  const [seen] = useState(sequence);
  const unread = sequence - seen;
  if (unread <= 0) return null;
  return (
    <span
      title={`${unread} new message${unread === 1 ? "" : "s"}`}
      className="shrink-0 min-w-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center
                 bg-[linear-gradient(135deg,var(--color-highlight-bright),var(--color-highlight-deeper))] text-(--color-highlight-ink)"
    >
      {unread > 99 ? "99+" : unread}
    </span>
  );
}

/** Table talk.
 *
 * Nothing here is stored: what is said at a friendly game belongs to the night
 * it was said in. Reloading the page starts an empty room, which is also why
 * this never pretends to be a history.
 */
export default function ChatPanel({ className = "w-72 h-48", bare = false }) {
  const chat = useGameStore((s) => s.chat);
  const [draft, setDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  // Where to draw the picker, measured from the button. It renders in a portal
  // rather than inside the panel: the chat body scrolls, and a floating panel
  // clips its own children, so a picker positioned inside it was cut off at the
  // panel's edge instead of opening over the table.
  const [pickerAt, setPickerAt] = useState(null);
  const gifButton = useRef(null);
  const scroller = useRef(null);

  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [chat]);

  const submit = (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    // A closed socket swallows this; clearing anyway would lose what was typed.
    if (send({ type: "chat_message", text: text.slice(0, MAX_CHARS) })) setDraft("");
  };

  // A GIF is its own message: sending it with whatever half-typed line is in
  // the box would post that line by surprise.
  const sendGif = (gifId) => {
    send({ type: "chat_message", gif_id: gifId });
    setPickerOpen(false);
  };

  const togglePicker = () => {
    if (pickerOpen) {
      setPickerOpen(false);
      return;
    }
    const rect = gifButton.current?.getBoundingClientRect();
    if (rect) {
      // Kept on screen: near a window edge the picker would otherwise open
      // half outside it.
      setPickerAt({
        left: Math.min(Math.max(8, rect.left), window.innerWidth - 264),
        bottom: Math.max(8, window.innerHeight - rect.top + 6),
      });
    }
    setPickerOpen(true);
  };

  return (
    // `bare` is the form used inside a FloatingPanel, which supplies the frame
    // and the title bar itself — including the media controls.
    <div className={bare
      ? "w-full h-full flex flex-col"
      : `panel rounded-lg flex flex-col shadow-lg shadow-black/50 ${className}`}>
      {!bare && (
        <div className="px-3 py-1.5 border-b border-(--color-border) flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-(--color-silver)">Table chat</h2>
          <MediaControls />
        </div>
      )}

      <div ref={scroller} className="flex-1 overflow-y-auto px-3 py-2 text-xs space-y-1.5">
        {chat.length === 0 ? (
          <p className="text-(--color-text-muted)">Nobody has said anything yet.</p>
        ) : (
          chat.map((message) => (
            <div key={message.id} className="leading-snug break-words">
              <span className="font-semibold text-(--color-highlight-text)">{message.name}</span>
              {message.text && <span className="text-(--color-silver)"> {message.text}</span>}
              {message.gifId && (
                <img
                  src={gifPreviewUrl(message.gifId)}
                  alt={`GIF from ${message.name}`}
                  loading="lazy"
                  className="mt-1 rounded border border-(--color-border) max-w-full w-32"
                />
              )}
            </div>
          ))
        )}
      </div>

      <form onSubmit={submit} className="flex gap-1.5 p-2 border-t border-(--color-border)">
        {pickerOpen && pickerAt && createPortal(
          <>
            {/* Catches the click that dismisses it, the same trick the theme
                panel's dropdown uses. */}
            <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
            <div className="fixed z-50" style={{ left: pickerAt.left, bottom: pickerAt.bottom }}>
              <GifPicker onPick={sendGif} onClose={() => setPickerOpen(false)} />
            </div>
          </>,
          document.body,
        )}
        <button
          ref={gifButton}
          type="button"
          onClick={togglePicker}
          title="Send a GIF"
          aria-label="Send a GIF"
          aria-expanded={pickerOpen}
          className="btn-secondary px-2 py-1 rounded text-[10px] font-bold tracking-wide transition-colors shrink-0"
        >
          GIF
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHARS))}
          placeholder="Say something…"
          aria-label="Message the table"
          className="input-field flex-1 min-w-0 rounded px-2 py-1 text-xs transition-colors"
        />
        <button type="submit" disabled={!draft.trim()}
          className="btn-secondary px-2.5 py-1 rounded text-xs font-semibold transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed">
          Send
        </button>
      </form>
    </div>
  );
}
