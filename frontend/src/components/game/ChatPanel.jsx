import { useEffect, useRef, useState } from "react";
import useGameStore from "../../store/gameStore";
import { send } from "../../api/socket";
import MediaControls from "./MediaControls";

const MAX_CHARS = 240;

/** Table talk.
 *
 * Nothing here is stored: what is said at a friendly game belongs to the night
 * it was said in. Reloading the page starts an empty room, which is also why
 * this never pretends to be a history.
 */
export default function ChatPanel({ className = "w-56 h-32" }) {
  const chat = useGameStore((s) => s.chat);
  const [draft, setDraft] = useState("");
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

  return (
    <div className={`panel rounded-lg flex flex-col shadow-lg shadow-black/50 ${className}`}>
      <div className="px-3 py-1.5 border-b border-(--color-border) flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-(--color-silver)">Table chat</h2>
        <MediaControls />
      </div>

      <div ref={scroller} className="flex-1 overflow-y-auto px-3 py-2 text-xs space-y-1.5">
        {chat.length === 0 ? (
          <p className="text-(--color-text-muted)">Nobody has said anything yet.</p>
        ) : (
          chat.map((message) => (
            <p key={message.id} className="leading-snug break-words">
              <span className="font-semibold text-[#d9c07a]">{message.name}</span>
              <span className="text-(--color-silver)"> {message.text}</span>
            </p>
          ))
        )}
      </div>

      <form onSubmit={submit} className="flex gap-1.5 p-2 border-t border-(--color-border)">
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
