import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Avatar from "../Avatar";
import Icon from "../icons/Icon";
import useAuthStore from "../../store/authStore";
import useInboxStore from "../../store/inboxStore";
import useMissionStore from "../../store/missionStore";
import CalotesPanel from "./CalotesPanel";
import ClubPanel from "./ClubPanel";
import MissionPanel from "./MissionPanel";
import ProfileCard from "./ProfileCard";
import RecoveryCodePanel from "./RecoveryCodePanel";
import StatsPanel from "./StatsPanel";
import FriendsPanel from "./FriendsPanel";
import { SIDE_PANELS, isPanel, toggleOpen } from "./sidePanels";
import { friendAsks, missionsWaiting } from "./stripBadges";

/**
 * The badge, lifted from the bell in the header rather than drawn again.
 *
 * Two badges in one app that are nearly the same shape is two badges nobody
 * trusts, and these two are on the same screen a couple of inches apart. With
 * a number in it, it is a pill; with nothing but a screen-reader word in it,
 * min-w-4 and leading-4 make it the dot — same colour, same corner, no second
 * design to keep in step.
 */
const BADGE = `absolute -top-0.5 -right-0.5 min-w-4 px-1 rounded-full
               text-[9px] font-bold leading-4 text-center
               bg-(--color-highlight-bright) text-(--color-highlight-ink)`;

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
  // Somebody sent here to answer something — the bell links to the panel the
  // answer is in — arrives with it named in the address. On a wide screen every
  // panel is already open and this does nothing; on a phone it is the
  // difference between landing on the answer and landing near it.
  const [params] = useSearchParams();
  const asked = params.get("panel");
  useEffect(() => { if (asked && isPanel(asked)) setOpen(asked); }, [asked]);

  // The mission board, asked for by the strip rather than by the panel.
  //
  // MissionPanel was the only thing that had ever called fetchMissions(), and
  // on a phone it is mounted only while it is open — so the board was never
  // fetched at all unless somebody guessed which icon it was behind, and the
  // one number that could have made them guess right was inside the fetch they
  // had not made.
  //
  // The guard is because this strip is hidden with CSS rather than unmounted,
  // so on a wide screen it and the sidebar's own MissionPanel both ask on the
  // same commit. `loading` is set before the request goes out, so whichever
  // effect runs first claims the fetch and the other stands down; it is read
  // from the store rather than from a render, which would still be false in
  // both closures. MissionPanel does the same, so the order does not matter.
  const missions = useMissionStore((s) => s.missions);
  const fetchMissions = useMissionStore((s) => s.fetchMissions);
  useEffect(() => {
    if (!useMissionStore.getState().loading) fetchMissions();
  }, [fetchMissions]);

  // Free: AppHeader mounts the bell on every page and the bell fills this
  // store. Reading it here adds no request, which is the only reason Friends
  // gets a badge and Calotes does not.
  const inbox = useInboxStore((s) => s.items);

  const waiting = missionsWaiting(missions);
  const asks = friendAsks(inbox);

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

      {/* The word under the icon, not beside it.

          This row carried six bare glyphs for a while on the grounds that six
          labels do not fit across a phone — "Missions" came out as "Missio…".
          That was true of the layout it was tried in and only that one: the
          label was inline beside a 20px icon, which needs about 68px in a
          button that has 53px. Stacked it is the label alone. At 390px the page
          is px-4, so 390−32 = 358; five gap-1.5 take 30; 328 ÷ 6 is 54.7px a
          button, and "Missions" at text-[10px] semibold is around 42. The
          drop to 9px below 360px is for the phones that are narrower still.

          A glyph nobody has learned yet is a guess, and six of them in a row is
          six guesses before you find the one panel you wanted. */}
      <div className="flex items-stretch gap-1.5">
        {SIDE_PANELS.map((one) => {
          const active = open === one.key;
          // The one rule, applied: a number for money you can collect, a dot
          // for a person waiting on you. See stripBadges.js.
          const count = one.key === "missions" ? waiting : 0;
          const dot = one.key === "friends" && asks > 0;
          return (
            <button
              key={one.key}
              type="button"
              onClick={() => setOpen((current) => toggleOpen(current, one.key))}
              aria-pressed={active}
              className={`relative flex-1 min-w-0 flex flex-col items-center justify-start gap-1
                          px-1 py-2 rounded-lg border transition-colors ${
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
                />
              ) : (
                // No `name`, and hidden from the reader: Avatar makes alt text
                // out of a name, and this button is called "You" by the word
                // printed under it. "Dan's avatar You" is not a better button.
                <span aria-hidden="true" className="w-5 h-5 rounded-full overflow-hidden block">
                  <Avatar
                    url={user?.profile?.avatar_url}
                    emoji={user?.profile?.avatar_emoji}
                    border={user?.profile?.avatar_border}
                    className="w-full h-full"
                    emojiClassName="text-[0.7rem]"
                  />
                </span>
              )}

              {/* The accessible name of the button, now that it is on screen:
                  no aria-label, no title, and no label on the Icon either —
                  Icon.jsx turns that into role="img" with its own aria-label,
                  which would put the word into the button's name twice. */}
              <span className={`block w-full truncate text-center leading-none font-semibold
                                tracking-tight text-[10px] max-[360px]:text-[9px] ${
                active ? "text-(--color-highlight-text)" : "text-(--color-text-muted)"
              }`}>
                {one.label}
              </span>

              {/* Money you can collect, said as a number. The sr-only word is
                  what stops the button being announced as "Missions, 2". */}
              {count > 0 && (
                <span className={BADGE}>
                  {count > 9 ? "9+" : count}
                  <span className="sr-only"> to collect</span>
                </span>
              )}
              {/* A person waiting, said as a dot: the same badge with nothing
                  written in it, which is a filled circle. Deliberately not the
                  count — the bell in the header a few pixels above is already
                  showing that number, and two of them a beat out of step is
                  worse than one. */}
              {dot && (
                <span className={BADGE}>
                  <span className="sr-only">someone is waiting</span>
                </span>
              )}

              {/* Which panel the thing below belongs to. Six buttons and one
                  open panel, and nothing said they were the same press: this
                  is a notch in the space-y-3 gap, pointing down at it. */}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute -bottom-[7px] left-1/2 -ml-[5px] w-2.5 h-2.5 rotate-45
                             border-b border-r border-(--color-highlight-edge)
                             bg-(--color-highlight-dim)"
                />
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
