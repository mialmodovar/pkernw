import { useState } from "react";

import Avatar from "./Avatar";
import useAuthStore from "../store/authStore";
import SettingsPanel from "./lobby/SettingsPanel";

/**
 * Who you are, and the two things about that you might want to change.
 *
 * The same avatar picker and appearance panel the lobby's profile card opens,
 * reached from the one place your name appears at the table — going back to the
 * lobby to change a card back is a strange thing to have to do mid-tournament,
 * and this is where a player already looks for themselves.
 *
 * Both buttons open the same window — the same one the lobby's profile card
 * opens — and differ only in which page of it they land on. Two doors into one
 * room: what a player can change about themselves must not depend on which of
 * them they came through, and nothing has to be positioned against this bar.
 */
export default function UserChip() {
  const user = useAuthStore((s) => s.user);
  // Which page the settings are open on, or null for closed.
  const [page, setPage] = useState(null);

  const toggle = (name) => setPage((current) => (current === name ? null : name));

  if (!user) return null;

  return (
    <span className="relative flex items-center gap-1 pr-2 mr-1 border-r border-(--color-border)">
      <button
        type="button"
        onClick={() => toggle("profile")}
        title="Your name and picture"
        aria-label="Your name and picture"
        aria-expanded={page === "profile"}
        className="tap-target flex items-center gap-1.5 rounded px-1 py-0.5
                   hover:bg-white/10 transition-colors"
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
        onClick={() => toggle("theme")}
        title="Settings"
        aria-label="Settings"
        aria-expanded={page === "theme"}
        className={`tap-target w-5 h-5 flex items-center justify-center rounded transition-colors ${
          page === "theme" ? "bg-white/10" : "hover:bg-white/10"
        }`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"
          className="w-3.5 h-3.5 text-(--color-text-muted)" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {/* One window, whichever button opened it — see SettingsPanel. */}
      {page && <SettingsPanel page={page} onClose={() => setPage(null)} />}
    </span>
  );
}
