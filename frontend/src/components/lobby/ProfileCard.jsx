import { useState } from "react";
import Avatar from "../Avatar";
import useAuthStore from "../../store/authStore";
import SettingsPanel from "./SettingsPanel";

export default function ProfileCard() {
  const { user } = useAuthStore();

  // Which page of the settings is open, or null for closed. The same window the
  // header's gear opens, on the page this button is about: the two used to be
  // different panels with different contents, so which settings a player could
  // find depended on which of them they had found.
  const [openPanel, setOpenPanel] = useState(null);
  const toggle = (panel) => setOpenPanel((current) => (current === panel ? null : panel));

  return (
    <div className={`panel rounded-lg p-4 relative shadow-lg shadow-black/40 ${openPanel ? "z-20" : ""}`}>
      {/* The only panel here that never said what it was. Every other one has a
          heading, and on a phone the heading is how you know the button you
          pressed was the button you meant — this one opened with a name and a
          gear and left you to work it out. The avatar is repeated small beside
          the word for the same reason the other headings carry their icon: the
          strip's button for this panel is your own face, and this is where you
          find out that is what it was. */}
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-(--color-silver)">
        {/* No `name`, and hidden: Avatar turns a name into alt text, and the
            heading of this panel is "You", not "So-and-so's avatar You". */}
        <span aria-hidden="true" className="w-4 h-4 rounded-full overflow-hidden block shrink-0">
          <Avatar
            url={user?.profile?.avatar_url}
            emoji={user?.profile?.avatar_emoji}
            border={user?.profile?.avatar_border}
            className="w-full h-full"
            emojiClassName="text-[0.55rem]"
          />
        </span>
        You
      </h2>
      <div className="flex items-center gap-3">
        <button
          onClick={() => toggle("profile")}
          title="Your name and picture"
          className="w-14 h-14 rounded-full overflow-hidden panel-raised hover:border-(--color-accent-hover) transition-colors"
        >
          <Avatar
            url={user?.profile?.avatar_url}
            emoji={user?.profile?.avatar_emoji}
          border={user?.profile?.avatar_border}
            name={user?.profile?.display_name || user?.username}
            className="w-full h-full"
            emojiClassName="text-3xl"
          />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-(--color-silver) truncate">
            {user?.profile?.display_name || user?.username}
          </p>
          {/* The balance is in the header on every page now, which is where it
              belongs — saying it again here would be saying it twice. */}
          <button
            onClick={() => toggle("profile")}
            className="text-xs text-(--color-text-muted) hover:text-(--color-silver) transition-colors"
          >
            Change appearance
          </button>
        </div>
        <button
          onClick={() => toggle("theme")}
          title="Settings"
          aria-label="Settings"
          aria-expanded={openPanel === "theme"}
          className={`ml-auto shrink-0 w-8 h-8 flex items-center justify-center rounded panel-raised transition-colors ${
            openPanel === "theme" ? "border-(--color-accent-hover)" : ""
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
      {openPanel && (
        <SettingsPanel page={openPanel} onClose={() => setOpenPanel(null)} />
      )}
    </div>
  );
}
