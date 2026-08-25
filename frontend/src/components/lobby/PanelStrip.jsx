import { useState } from "react";

import Avatar from "../Avatar";
import Icon from "../icons/Icon";
import useAuthStore from "../../store/authStore";
import CalotesPanel from "./CalotesPanel";
import ClubPanel from "./ClubPanel";
import MissionPanel from "./MissionPanel";
import ProfileCard from "./ProfileCard";
import RecoveryCodePanel from "./RecoveryCodePanel";
import StatsPanel from "./StatsPanel";
import FriendsPanel from "./FriendsPanel";
import { SIDE_PANELS, toggleOpen } from "./sidePanels";

/**
 * The sidebar, for a screen that has no side.
 *
 * On a phone the lobby's column of panels was eight blocks above the thing
 * anybody opened the app for, so the games started below the fold and the
 * first thing you did every time was scroll past your own statistics. Here it
 * is a row of icons instead: nothing open until you ask, one at a time, and
 * the games directly underneath.
 *
 * The panels themselves are the same components the wide layout draws. A phone
 * version of each would be six more things to keep in step with six things.
 */
export default function PanelStrip({ onClubsLoaded }) {
  const [open, setOpen] = useState(null);
  const user = useAuthStore((s) => s.user);

  // ClubPanel is what tells the page which clubs this player organises, and
  // the New game buttons depend on the answer. So it is mounted whether or not
  // it is on screen — hidden rather than absent, since a panel nobody opened
  // must not take the permission with it.
  const body = {
    missions: <MissionPanel />,
    stats: <StatsPanel />,
    calotes: <CalotesPanel />,
    friends: <FriendsPanel />,
    profile: <ProfileCard />,
  }[open] || null;

  return (
    <div className="lg:hidden space-y-3">
      {/* Not behind an icon: it is a warning rather than a panel to browse, it
          draws nothing at all once there is nothing to warn about, and a phone
          was the one place it had stopped appearing. */}
      <RecoveryCodePanel />

      {/* Icons and no words. Six labels do not fit across a phone — "Missions"
          came out as "Missio…" — and the panel that opens says what it is in
          its own heading, an inch below the icon that opened it. */}
      <div className="flex items-center gap-1.5">
        {SIDE_PANELS.map((one) => {
          const active = open === one.key;
          return (
            <button
              key={one.key}
              type="button"
              aria-label={one.label}
              onClick={() => setOpen((current) => toggleOpen(current, one.key))}
              aria-pressed={active}
              title={one.label}
              className={`flex-1 min-w-0 flex items-center justify-center py-2.5 rounded-lg
                          border transition-colors ${
                active
                  ? "border-(--color-highlight-edge) bg-(--color-highlight-dim)"
                  : "border-(--color-border) panel-raised"
              }`}
            >
              {/* Your own face for your own panel: it is the icon and the thing
                  it opens, and no drawn glyph says "you" as well. */}
              {one.icon ? (
                <Icon
                  name={one.icon}
                  className="w-5 h-5"
                  tone={active ? "gold" : "mono"}
                  label={one.label}
                />
              ) : (
                <span className="w-5 h-5 rounded-full overflow-hidden block">
                  <Avatar
                    url={user?.profile?.avatar_url}
                    emoji={user?.profile?.avatar_emoji}
                    border={user?.profile?.avatar_border}
                    name={user?.profile?.display_name || user?.username}
                    className="w-full h-full"
                    emojiClassName="text-[0.7rem]"
                  />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {body}

      {/* Off screen, and still doing its job — see above. */}
      <div className={open === "clubs" ? "" : "hidden"}>
        <ClubPanel onClubsLoaded={onClubsLoaded} />
      </div>
    </div>
  );
}
