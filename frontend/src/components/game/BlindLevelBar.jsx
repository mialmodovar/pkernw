import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import Avatar from "../Avatar";
import useGameStore from "../../store/gameStore";
import { levelRemainingLabel, useLevelCountdown } from "./useLevelCountdown";
import useAuthStore from "../../store/authStore";
import EmojiPicker from "../lobby/EmojiPicker";
import ThemeSettings from "../lobby/ThemeSettings";
import { HomeIcon } from "./icons";

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
function UserChip() {
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

/**
 * Home and who you are: the two things in the header that are about the player
 * rather than about the hand.
 */
function IdentityChip({ onHome }) {
  return (
    <div className="flex items-center gap-2">
      {/* Home sits with the avatar rather than down among the table controls.
          Leaving the table is about you, not about this hand, and it is the one
          button that has to be in the same place on every screen. */}
      {onHome && (
        <button
          onClick={onHome}
          title="Back to the main menu — your seat is kept"
          aria-label="Home"
          className="btn-secondary shrink-0 flex items-center gap-1 rounded px-2 py-0.5
                     text-xs font-semibold transition-colors"
        >
          <HomeIcon />
          <span className="hidden md:inline">Home</span>
        </button>
      )}
      <UserChip />
    </div>
  );
}

/**
 * How the table reads out, and whether it makes a noise.
 *
 * Drawn down in the table row beside Sit out rather than up here beside your
 * avatar: both of these change what the felt does, as everything else in that
 * row does. Up here they sat among things about you.
 */
export function DisplayToggles() {
  const showBB = useGameStore((s) => s.showBB);
  const toggleBB = useGameStore((s) => s.toggleBB);
  const soundEnabled = useGameStore((s) => s.soundEnabled);
  const toggleSound = useGameStore((s) => s.toggleSound);

  return (
    <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
      <span className="hidden lg:inline text-xs text-(--color-text-muted)">Show</span>
      <div className="flex rounded overflow-hidden border border-(--color-border)">
        {[["Chips", false], ["BB", true]].map(([label, value]) => (
          <button
            key={label}
            onClick={() => { if (showBB !== value) toggleBB(); }}
            className={`px-2 py-0.5 text-xs font-semibold transition-colors ${
              showBB === value
                ? "bg-[linear-gradient(135deg,var(--color-highlight-bright),var(--color-highlight-deeper))] text-(--color-highlight-ink)"
                : "text-(--color-text-muted) hover:text-(--color-silver)"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        onClick={toggleSound}
        title={soundEnabled ? "Turn alert sound on (click to mute)" : "Turn alert sound muted"}
        aria-label={soundEnabled ? "Mute turn alert" : "Unmute turn alert"}
        className="btn-secondary px-2 py-0.5 rounded text-xs font-semibold transition-colors"
      >
        {soundEnabled ? "\u{1F509}" : "\u{1F507}"}
        <span className="hidden lg:inline">{soundEnabled ? " Sound" : " Muted"}</span>
      </button>
    </div>
  );
}

/** Which tournament this is, in the corner. Easy to forget you are in two. */
function TournamentName({ name }) {
  if (!name) return null;
  return (
    <span
      className="max-w-[8rem] md:max-w-[16rem] truncate font-semibold text-(--color-highlight-text)"
      title={name}
    >
      {name}
    </span>
  );
}

export default function BlindLevelBar({ name = null, controls = null, onHome = null }) {
  const level = useGameStore((s) => s.level);
  const remaining = useLevelCountdown();

  if (!level) {
    return (
      <div className="panel px-2 md:px-4 py-1.5 md:py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs md:text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
        <TournamentName name={name} />
          <span className="text-(--color-text-muted)">Waiting for level info...</span>
          {controls}
        </div>
        <IdentityChip onHome={onHome} />
      </div>
    );
  }

  const isTimed = level.duration_minutes != null;
  const isBreak = Boolean(level.is_break);

  return (
    <div className="panel px-2 md:px-4 py-1.5 md:py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs md:text-sm">
      {/* Pausing and skipping a level are things you do to the clock, so they
          sit with it rather than on a row of their own. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
        <TournamentName name={name} />
        <span className="text-(--color-silver)">
          {isBreak
            ? `Break after level ${level.blind_level_number || 0}`
            : `Level ${level.blind_level_number || 1} - SB ${level.small_blind} / BB ${level.big_blind}`}
          {!isBreak && level.ante > 0 && <> / Ante {level.ante}</>}
        </span>
        {controls}
      </div>
      <div className="flex items-center gap-2 md:gap-3 ml-auto">
        <IdentityChip onHome={onHome} />
        {/* What is left, not what has gone: a timed level says how long you
            have, and a level counted in hands should answer the same question
            rather than make you subtract. The tally is still in the tooltip. */}
        <span
          className="text-(--color-text-muted)"
          title={isTimed ? undefined : `Hand ${level.hands_in_level || 0} of ${level.duration_hands}`}
        >
          {levelRemainingLabel(level, remaining)}
        </span>
      </div>
    </div>
  );
}
