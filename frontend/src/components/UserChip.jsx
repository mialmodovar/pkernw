import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import Avatar from "./Avatar";
import useAuthStore from "../store/authStore";
import EmojiPicker from "./lobby/EmojiPicker";
import ThemeSettings from "./lobby/ThemeSettings";

/**
 * Who you are, and the two things about that you might want to change.
 *
 * The same avatar picker and appearance panel the lobby's profile card opens,
 * reached from the one place your name appears at the table — going back to the
 * lobby to change a card back is a strange thing to have to do mid-tournament,
 * and this is where a player already looks for themselves.
 *
 * One panel at a time, like the profile card, since both drop from the same
 * chip and two at once would overlap.
 *
 * Drawn through a portal rather than in place. Every .panel carries a
 * backdrop-filter, and a backdrop filter makes a stacking context — so a panel
 * opened inside this bar was sealed into it, however high its z-index, and
 * whatever sat below it simply painted over the top. The portal takes it out of
 * that box entirely.
 */
export default function UserChip() {
  const user = useAuthStore((s) => s.user);
  const updateAvatar = useAuthStore((s) => s.updateAvatar);
  const [panel, setPanel] = useState(null);
  const [at, setAt] = useState(null);
  const chip = useRef(null);

  const toggle = (name) => {
    if (panel === name) {
      setPanel(null);
      return;
    }
    const rect = chip.current?.getBoundingClientRect();
    if (rect) {
      // Hung off the right edge, where the chip is, and kept on screen.
      setAt({
        right: Math.max(8, window.innerWidth - rect.right),
        top: rect.bottom + 6,
      });
    }
    setPanel(name);
  };

  if (!user) return null;

  return (
    <span ref={chip} className="relative flex items-center gap-1 pr-2 mr-1 border-r border-(--color-border)">
      <button
        type="button"
        onClick={() => toggle("avatar")}
        title="Change your appearance"
        aria-label="Change your appearance"
        aria-expanded={panel === "avatar"}
        className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-white/10 transition-colors"
      >
        <Avatar
          url={user.profile?.avatar_url}
          emoji={user.profile?.avatar_emoji}
        border={user.profile?.avatar_border}
          name={user.profile?.display_name || user.username}
          className="w-5 h-5 rounded-full"
        />
        <span className="hidden md:inline text-xs font-semibold text-(--color-silver)">
          {user.profile?.display_name || user.username}
        </span>
      </button>
      <button
        type="button"
        onClick={() => toggle("settings")}
        title="Theme settings"
        aria-label="Theme settings"
        aria-expanded={panel === "settings"}
        className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
          panel === "settings" ? "bg-white/10" : "hover:bg-white/10"
        }`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"
          className="w-3.5 h-3.5 text-(--color-text-muted)" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {panel && at && createPortal(
        <>
          {/* Catches the click that dismisses it, the same way the theme
              panel's own dropdown does. */}
          <div className="fixed inset-0 z-40" onClick={() => setPanel(null)} />
          {/* A zero-height anchor of the right width, hung where the chip is:
              both panels position themselves against a relative parent, and
              this gives them one. */}
          <div className="fixed z-50 w-60" style={{ right: at.right, top: at.top }}>
            <div className="relative">
              {panel === "avatar" && (
                <EmojiPicker onSelect={updateAvatar} onClose={() => setPanel(null)} />
              )}
              {panel === "settings" && <ThemeSettings onClose={() => setPanel(null)} />}
            </div>
          </div>
        </>,
        document.body,
      )}
    </span>
  );
}
