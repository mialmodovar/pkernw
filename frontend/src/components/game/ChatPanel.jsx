import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useGameStore from "../../store/gameStore";
import useAuthStore from "../../store/authStore";
import { send } from "../../api/socket";
import { gifPreviewUrl } from "../../api/giphy";
import GifPicker from "./GifPicker";
import MediaControls from "./MediaControls";

const MAX_CHARS = 240;

/** The things actually said at a table, one tap away.
 *
 * Short on purpose. Anything longer than this is worth typing, and a wall of
 * canned sentences is how a chat starts sounding like a vending machine — but
 * "nh" while you are working out whether you were beaten is a message nobody
 * has time to type. The expansions are in the tooltips, since half of these are
 * only obvious if you already play. */
const QUICK_MESSAGES = [
  { text: "nh", hint: "Nice hand" },
  { text: "gg", hint: "Good game" },
  { text: "ty", hint: "Thank you" },
  { text: "gl", hint: "Good luck" },
  { text: "lol", hint: "Well then" },
  { text: "brutal", hint: "That was rough" },
  { text: "one time!", hint: "Come on, deck" },
  { text: "sorry", hint: "Sorry — for the suckout you just put on somebody" },
];

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
  // Off by default: the panel is small, and the row costs a line of the
  // conversation to show. The button next to it is how you get it back.
  const [quickOpen, setQuickOpen] = useState(false);
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

  // Straight out, without touching the draft: a canned line is a thing you say
  // instead of typing, not a thing you type into what you were already saying.
  const sendQuick = (text) => send({ type: "chat_message", text });

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
                  {message.text && <span className="text-(--color-silver)">{message.text}</span>}
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

      {quickOpen && (
        // One line, scrolled sideways rather than wrapped: the panel is short,
        // and a canned-message tray that eats half the conversation is worse
        // than one you have to swipe.
        <div className="flex gap-1 px-2 pt-1.5 overflow-x-auto border-t border-(--color-border)">
          {QUICK_MESSAGES.map((quick) => (
            <button
              key={quick.text}
              type="button"
              title={quick.hint}
              onClick={() => sendQuick(quick.text)}
              className="btn-secondary shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors"
            >
              {quick.text}
            </button>
          ))}
        </div>
      )}

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
          type="button"
          onClick={() => setQuickOpen((open) => !open)}
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
