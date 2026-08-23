import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useGameStore from "../../store/gameStore";
import useAuthStore from "../../store/authStore";
import { send } from "../../api/socket";
import QuickMessageList from "./QuickMessageList";
import { isEmojiMessage } from "./emojiMessage";
import { sendQuickMessage } from "./quickMessages";
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
  const myUserId = useAuthStore((s) => s.user?.id);
  const [draft, setDraft] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickAt, setQuickAt] = useState(null);
  const quickButton = useRef(null);
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

  // Hung off its own button, and kept on screen near an edge — the same
  // arithmetic the GIF picker does, for the same reason: this panel scrolls and
  // clips, so anything opening out of it has to leave through a portal.
  const toggleQuick = () => {
    if (quickOpen) {
      setQuickOpen(false);
      return;
    }
    const rect = quickButton.current?.getBoundingClientRect();
    if (rect) {
      setQuickAt({
        left: Math.min(Math.max(8, rect.left), window.innerWidth - 184),
        bottom: Math.max(8, window.innerHeight - rect.top + 6),
      });
    }
    setQuickOpen(true);
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

      {/* What people said is text, and text is for copying out. */}
      <div ref={scroller} className="selectable flex-1 overflow-y-auto px-3 py-2 text-xs space-y-1.5">
        {chat.length === 0 ? (
          <p className="text-(--color-text-muted)">Nobody has said anything yet.</p>
        ) : (
          chat.map((message) => {
            // Sided by who said it. Your own lines need no name on them — you
            // know — and the side they sit on is what makes a glance at the
            // panel tell you whether the room is talking or you are.
            const mine = myUserId != null && message.userId === myUserId;
            return (
              <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-2 py-1 leading-snug break-words border ${
                  mine
                    ? "bg-(--color-highlight-dim) border-(--color-highlight-edge) text-right"
                    : "bg-black/25 border-(--color-border)"
                }`}>
                  {!mine && (
                    <span className="font-semibold text-(--color-highlight-text)">{message.name} </span>
                  )}
                  {message.text && (
                    // A message that is only faces is drawn as the picture it
                    // is, the same as it is over the seat that sent it.
                    <span className={isEmojiMessage(message.text)
                      ? "text-2xl leading-none align-middle"
                      : "text-(--color-silver)"}>
                      {message.text}
                    </span>
                  )}
                  {message.gifId && (
                    <img
                      src={gifPreviewUrl(message.gifId)}
                      alt={`GIF from ${message.name}`}
                      loading="lazy"
                      className="mt-1 rounded border border-(--color-border) max-w-full w-32"
                    />
                  )}
                </div>
              </div>
            );
          })
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
        {quickOpen && quickAt && createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setQuickOpen(false)} />
            <div className="fixed z-50" style={{ left: quickAt.left, bottom: quickAt.bottom }}>
              <QuickMessageList onPick={(text) => { sendQuickMessage(text); setQuickOpen(false); }} />
            </div>
          </>,
          document.body,
        )}
        <button
          ref={quickButton}
          type="button"
          onClick={toggleQuick}
          title={quickOpen ? "Hide quick messages" : "Quick messages"}
          aria-label={quickOpen ? "Hide quick messages" : "Quick messages"}
          aria-expanded={quickOpen}
          className={`px-2 py-1 rounded text-xs leading-none transition-colors shrink-0 ${
            quickOpen ? "btn-accent" : "btn-secondary"
          }`}
        >
          {"\u{1F4AC}"}
        </button>
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
