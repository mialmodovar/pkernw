import { useState } from "react";
import useAuthStore from "../../store/authStore";
import EmojiPicker from "./EmojiPicker";
import ThemeSettings from "./ThemeSettings";

export default function ProfileCard() {
  const { user, updateAvatar } = useAuthStore();
  // One panel at a time: both drop out of the same card, and two of them open
  // at once would overlap.
  const [openPanel, setOpenPanel] = useState(null);
  const toggle = (panel) => setOpenPanel((current) => (current === panel ? null : panel));

  return (
    <div className={`panel rounded-lg p-4 relative shadow-lg shadow-black/40 ${openPanel ? "z-20" : ""}`}>
      <div className="flex items-center gap-3">
        <button
          onClick={() => toggle("avatar")}
          title="Change avatar"
          className="w-14 h-14 flex items-center justify-center text-3xl rounded-full panel-raised hover:border-(--color-accent-hover) transition-colors"
        >
          {user?.profile?.avatar_emoji || "🃏"}
        </button>
        <div className="min-w-0">
          <p className="font-semibold text-(--color-silver) truncate">{user?.username}</p>
          <button
            onClick={() => toggle("avatar")}
            className="text-xs text-(--color-text-muted) hover:text-(--color-silver) transition-colors"
          >
            Change avatar
          </button>
        </div>
        <button
          onClick={() => toggle("settings")}
          title="Appearance settings"
          aria-label="Appearance settings"
          aria-expanded={openPanel === "settings"}
          className={`ml-auto shrink-0 w-8 h-8 flex items-center justify-center rounded panel-raised transition-colors ${
            openPanel === "settings" ? "border-(--color-accent-hover)" : ""
          }`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"
            className="w-4 h-4 text-(--color-silver)" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
      {openPanel === "avatar" && (
        <EmojiPicker onSelect={updateAvatar} onClose={() => setOpenPanel(null)} />
      )}
      {openPanel === "settings" && <ThemeSettings onClose={() => setOpenPanel(null)} />}
    </div>
  );
}
