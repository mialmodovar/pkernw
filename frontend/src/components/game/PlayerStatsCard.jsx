import { useEffect, useState } from "react";

import api from "../../api/http";
import Avatar from "../Avatar";
import playerProfile, { PROFILE_MIN_HANDS } from "./playerProfile";
import { GROUPS, THIN_SAMPLE } from "./playerRead";

/**
 * Keep an eye on this player from the lobby afterwards.
 *
 * This is where you meet people worth remembering, so this is where marking
 * one belongs — the lobby's watch panel can add by name, but only if you can
 * remember the name.
 */
function WatchToggle({ username, isMe, initial, onChange }) {
  const [watched, setWatched] = useState(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setWatched(initial); }, [initial]);

  if (isMe || watched === null || watched === undefined) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      if (watched) {
        await api.delete(`/auth/watching/${encodeURIComponent(username)}/`);
      } else {
        await api.post("/auth/watching/", { username });
      }
      setWatched(!watched);
      onChange?.(!watched);
    } catch {
      // Nothing lost: the button still says what the server last told us.
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={watched ? `Stop watching ${username}` : `Follow ${username} from home`}
      className={`px-2 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-50 ${
        watched ? "btn-secondary" : "btn-accent"
      }`}
    >
      {watched ? "Watching" : "Watch"}
    </button>
  );
}


/**
 * A hover explanation that actually appears. The native `title` tooltip is at
 * the browser's mercy — slow, easy to miss, and absent on touch — so this is
 * drawn in the card, and opens on focus too for anyone tapping rather than
 * pointing.
 */
function Tip({ text, above, children }) {
  return (
    <span className="relative inline-block group focus-within:z-20 hover:z-20">
      <span tabIndex={0} className="cursor-help outline-none">{children}</span>
      <span role="tooltip"
        className={`pointer-events-none absolute left-0 z-30 w-44 rounded-md border border-(--color-border-strong)
                    bg-[#120b0d] px-2 py-1.5 text-[10px] font-normal leading-snug text-(--color-silver)
                    shadow-lg shadow-black/70 opacity-0 transition-opacity
                    group-hover:opacity-100 group-focus-within:opacity-100
                    ${above ? "bottom-full mb-1" : "top-full mt-1"}`}>
        {text}
      </span>
    </span>
  );
}

function Bar({ pct }) {
  return (
    <div className="h-1 rounded-full overflow-hidden bg-black/50 border border-(--color-border)">
      <div
        className="h-full bg-[linear-gradient(90deg,var(--color-accent-deep),var(--color-highlight-bright))]"
        style={{ width: `${Math.min(100, pct || 0)}%` }}
      />
    </div>
  );
}

function StatRow({ row, stats, hands, above }) {
  const chances = row.chances ? stats[row.chances] : hands;
  const value = stats[row.key];
  // A stat the server did not send is unknown, which is not the same as zero.
  const known = chances > 0 && typeof value === "number";

  return (
    <div className="min-w-0">
      <div className="flex justify-between items-baseline gap-1 text-[11px]">
        <Tip text={row.hint} above={above}>
          <span className="text-(--color-silver) underline decoration-dotted decoration-(--color-text-muted) underline-offset-2">
            {row.label}
          </span>
        </Tip>
        <span className="shrink-0 text-(--color-highlight-text) font-semibold">
          {known ? `${value}%` : "—"}
          <span className="text-(--color-text-muted) font-normal"> ({chances ?? 0})</span>
        </span>
      </div>
      <div className="mt-1"><Bar pct={known ? value : 0} /></div>
    </div>
  );
}

/**
 * The read on a player, from recorded hand history. Every number carries the
 * sample it came from — a 100% 3-bet over two chances is noise, and hiding that
 * would be worse than showing nothing.
 */
export default function PlayerStatsCard({ player, stats, onClose, isMe = false }) {
  const hands = stats?.hands ?? 0;
  const badBeats = stats?.bad_beats ?? 0;
  const profile = playerProfile(stats);
  // Who they are away from this table: whether you are watching them, and the
  // clubs you are both allowed to know about. One request, since both live on
  // the same profile.
  const [away, setAway] = useState(null);

  useEffect(() => {
    const username = player.username;
    if (!username) return undefined;
    let cancelled = false;
    api.get(`/auth/players/${encodeURIComponent(username)}/`)
      .then(({ data }) => { if (!cancelled) setAway(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [player.username]);

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center px-4" onClick={onClose}>
      <div className="panel rounded-xl w-full max-w-sm p-4 shadow-2xl shadow-black/70 max-h-[85vh] overflow-y-auto"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Avatar
            url={player.avatar_url}
            emoji={player.avatar}
            name={player.name}
            className="w-9 h-9 shrink-0 rounded-full border border-(--color-border)"
            emojiClassName="text-2xl"
          />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-(--color-silver) truncate">{player.name}</p>
            <p className="text-xs text-(--color-text-muted)">
              {hands ? `${hands.toLocaleString()} hands recorded` : "No hands recorded yet"}
              {/* Beside the hand count rather than down among the percentages:
                  it is not a tendency you read them by, it is a thing that
                  happened to them, and it is the first thing anybody wants to
                  hear about. */}
              {badBeats > 0 && (
                <Tip text={`${badBeats} showdown${badBeats === 1 ? "" : "s"} lost holding `
                  + "three of a kind or better"}>
                  <span className="ml-1.5 text-(--color-accent-link) font-semibold cursor-help">
                    {"\u{1F494}"} {badBeats} bad beat{badBeats === 1 ? "" : "s"}
                  </span>
                </Tip>
              )}
            </p>
            {/* Their clubs, and a way into one. Opened in a tab of its own on
                purpose: following a link out of here mid-hand would leave the
                table to fold you while you read a league table. */}
            {away?.clubs?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {away.clubs.map((club) => (
                  <a
                    key={club.slug}
                    href={`/clubs/${club.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    title={`Open ${club.name}`}
                    className="panel-raised rounded-full pl-1 pr-2 py-0.5 flex items-center gap-1
                               text-[10px] text-(--color-silver) hover:border-(--color-highlight)
                               border border-transparent transition-colors"
                  >
                    <span className="text-xs leading-none">{club.emoji}</span>
                    <span className="max-w-[7rem] truncate">{club.name}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
          <WatchToggle
            username={player.username}
            isMe={isMe}
            initial={away?.is_watched}
            onChange={(next) => setAway((current) => ({ ...current, is_watched: next }))}
          />
          <button onClick={onClose}
            className="btn-secondary px-2 py-1 rounded text-xs font-semibold transition-colors">
            Close
          </button>
        </div>

        {hands === 0 ? (
          <p className="text-xs text-(--color-text-muted) mt-4">
            Nothing to read yet — stats build up as they play hands.
          </p>
        ) : (
          <>
            {/* One word for the whole read, with the reasoning a hover away. */}
            {profile ? (
              <div className="mt-3">
                <Tip text={profile.description}>
                  <span className="inline-block rounded-full border border-(--color-border-strong) bg-black/40 px-2 py-0.5 text-[11px] font-semibold text-(--color-highlight-text)">
                    {profile.label}
                  </span>
                </Tip>
              </div>
            ) : (
              <p className="mt-3 text-[11px] text-(--color-text-muted)">
                Profile after {PROFILE_MIN_HANDS} hands.
              </p>
            )}

            <div className="mt-3 space-y-3">
              {GROUPS.map((group, groupIndex) => (
                <div key={group.title}>
                  <p className="text-[10px] uppercase tracking-wide text-(--color-text-muted) mb-1.5">
                    {group.title}
                  </p>
                  {/* Two columns: the same read in half the height, so the whole
                      card fits without scrolling on a phone. */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {group.rows.map((row) => (
                      <StatRow key={row.key} row={row} stats={stats} hands={hands}
                        above={groupIndex === GROUPS.length - 1} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {hands < THIN_SAMPLE && (
              <p className="text-[11px] text-(--color-text-muted) mt-3">
                Small sample — treat these as a hint, not a read.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
