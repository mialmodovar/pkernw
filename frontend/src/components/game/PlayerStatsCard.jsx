import { useEffect, useState } from "react";

import api from "../../api/http";
import playerProfile, { PROFILE_MIN_HANDS } from "./playerProfile";

/**
 * Keep an eye on this player from the lobby afterwards.
 *
 * This is where you meet people worth remembering, so this is where marking
 * one belongs — the lobby's watch panel can add by name, but only if you can
 * remember the name.
 */
function WatchToggle({ username, isMe }) {
  const [watched, setWatched] = useState(null);   // null until we know
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isMe || !username) return undefined;
    let cancelled = false;
    api.get(`/auth/players/${encodeURIComponent(username)}/`)
      .then(({ data }) => { if (!cancelled) setWatched(data.is_watched); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [username, isMe]);

  if (isMe || watched === null) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      if (watched) {
        await api.delete(`/auth/watching/${encodeURIComponent(username)}/`);
      } else {
        await api.post("/auth/watching/", { username });
      }
      setWatched(!watched);
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
      title={watched ? `Stop watching ${username}` : `Watch ${username} from the lobby`}
      className={`px-2 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-50 ${
        watched ? "btn-secondary" : "btn-accent"
      }`}
    >
      {watched ? "Watching" : "Watch"}
    </button>
  );
}

// Grouped the way a read is built: how they enter a pot, what they do when
// somebody comes over the top, and how they play once there is a board.
const GROUPS = [
  {
    title: "Preflop",
    rows: [
      { key: "vpip_pct", label: "VPIP", hint: "Hands entered voluntarily before the flop" },
      { key: "pfr_pct", label: "PFR", hint: "Hands raised before the flop" },
      { key: "three_bet_pct", label: "3-bet", hint: "Raised over a raise, of the times they faced one", chances: "three_bet_chances" },
      { key: "ats_pct", label: "ATS", hint: "Raised first in from the cutoff, button or small blind", chances: "ats_chances" },
    ],
  },
  {
    title: "Facing a raise",
    rows: [
      { key: "fold_to_three_bet_pct", label: "Fold to 3-bet", hint: "Folded when the pot was 3-bet into them", chances: "vs_three_bet_chances" },
      { key: "call_three_bet_pct", label: "Call 3-bet", hint: "Called a 3-bet", chances: "vs_three_bet_chances" },
      { key: "four_bet_pct", label: "4-bet", hint: "Raised over a 3-bet", chances: "vs_three_bet_chances" },
      { key: "fold_to_four_bet_pct", label: "Fold to 4-bet", hint: "Folded when the pot was 4-bet into them", chances: "vs_four_bet_chances" },
      { key: "call_four_bet_pct", label: "Call 4-bet", hint: "Called a 4-bet", chances: "vs_four_bet_chances" },
    ],
  },
  {
    title: "Postflop",
    rows: [
      { key: "saw_flop_pct", label: "Saw flop", hint: "Hands where they were still in and acting on the flop" },
      { key: "cbet_pct", label: "C-bet", hint: "Bet the flop as the last preflop raiser", chances: "cbet_chances" },
      { key: "fold_to_cbet_pct", label: "Fold to c-bet", hint: "Folded to the preflop raiser's flop bet", chances: "fold_to_cbet_chances" },
      {
        key: "aggression_pct", label: "Aggression", chances: "postflop_actions",
        hint: "Share of their postflop bets, raises and calls that were bets or raises",
      },
    ],
  },
];

// Under this, the percentages say more about luck than about the player.
const THIN_SAMPLE = 30;

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
  const profile = playerProfile(stats);

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center px-4" onClick={onClose}>
      <div className="panel rounded-xl w-full max-w-sm p-4 shadow-2xl shadow-black/70 max-h-[85vh] overflow-y-auto"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="text-2xl leading-none">{player.avatar || "\u{1F0CF}"}</span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-(--color-silver) truncate">{player.name}</p>
            <p className="text-xs text-(--color-text-muted)">
              {hands ? `${hands.toLocaleString()} hands recorded` : "No hands recorded yet"}
            </p>
          </div>
          <WatchToggle username={player.name} isMe={isMe} />
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
