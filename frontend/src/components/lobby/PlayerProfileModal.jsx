import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import Avatar from "../Avatar";
import api from "../../api/http";
import { GROUPS, THIN_SAMPLE } from "../game/playerRead";
import { cellValue, headline, worthShowing } from "./friendsBattle";

const euros = (cents) => `${(cents / 100).toFixed(2)}€`;

const ordinal = (n) => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${suffix}`;
};

const formatDate = (value) => (value
  ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value))
  : "");

/**
 * Where this player is, right now.
 *
 * Two separate facts, and worth keeping separate: the tournament they are in
 * comes from the database and stays true through a dropped connection, while
 * being online means a table socket is actually open. Somebody seated but not
 * connected is exactly the case you would want to know about before deciding
 * whether it is worth going to look.
 */
function Presence({ profile }) {
  const { online, tournament } = profile;
  if (!tournament) {
    return (
      <p className={`text-xs ${online ? "text-[#7fc294]" : "text-(--color-text-muted)"}`}>
        {online ? "Online" : "Offline"}
      </p>
    );
  }
  return (
    <p className="text-xs text-(--color-text-muted) truncate">
      <span className={online ? "text-[#7fc294]" : ""}>
        {online ? "Playing" : "Seated, not connected"}
      </span>
      {" — "}
      <span className="text-(--color-silver)">{tournament.name}</span>
      {tournament.status === "paused" && " (paused)"}
    </p>
  );
}

/**
 * The read: how they play, rather than how they have done.
 *
 * Folded away by default. The four tiles above answer the question somebody
 * usually opens this card for — how are they doing — and a wall of percentages
 * on top of that buries it. Whoever wants the read knows they want it.
 */
function GameStats({ stats }) {
  const [open, setOpen] = useState(false);
  const hands = stats?.hands ?? 0;

  if (!hands) return null;

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 text-[10px] uppercase
                   tracking-wide text-(--color-text-muted) hover:text-(--color-silver) transition-colors"
      >
        <span>Game stats</span>
        <span className="flex items-center gap-1">
          {hands < THIN_SAMPLE && <span className="normal-case tracking-normal">thin sample</span>}
          <span className={`transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <p className="text-[10px] uppercase tracking-wide text-(--color-text-muted) mb-1">
                {group.title}
              </p>
              <div className="panel-raised rounded-lg divide-y divide-(--color-border)">
                {group.rows.map((row) => {
                  const value = stats[row.key];
                  // A stat the server did not send is unknown, which is not
                  // the same as zero.
                  if (value == null) return null;
                  const chances = row.chances ? stats[row.chances] : hands;
                  return (
                    <div key={row.key} className="px-3 py-1.5 flex items-center gap-2 text-xs">
                      <span className="flex-1 min-w-0 truncate text-(--color-silver)" title={row.hint}>
                        {row.label}
                      </span>
                      {/* How many chances it is out of, because a hundred
                          percent of two is not a read. */}
                      <span className="text-(--color-text-muted) tabular-nums">
                        {chances != null ? `/${chances}` : ""}
                      </span>
                      <span className="w-10 text-right font-semibold tabular-nums text-(--color-highlight-text)">
                        {Math.round(value)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Friends Battle: the only statistic anybody at a home game argues about.
 *
 * Only what happened on the nights both of you actually played, which is what
 * makes it an argument rather than two CVs side by side. None of it is a serious
 * measure of anybody's poker — the honest numbers are underneath — and the
 * rebuy row is deliberately one you want to lose.
 *
 * Rows nobody is on the board in are dropped rather than drawn as two zeroes:
 * a new friendship should look new, not broken.
 */
function FriendsBattle({ battle, them }) {
  const rows = (battle.rows || []).filter(worthShowing);
  return (
    <div className="mt-4">
      <h3 className="text-[10px] uppercase tracking-wide text-(--color-text-muted) mb-1">
        Friends battle
      </h3>
      <div className="panel-raised rounded-lg overflow-hidden">
        <p className="px-3 py-2 text-xs font-semibold text-(--color-silver)
                      border-b border-(--color-border)">
          {headline(battle, them)}
        </p>

        {rows.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-(--color-text-muted)">
            {battle.nights
              ? "Nothing to separate you yet."
              : "Play a tournament together and this fills in."}
          </p>
        ) : (
          <ul className="divide-y divide-(--color-border)">
            {rows.map((row) => (
              <li key={row.key} className="px-3 py-1.5 flex items-center gap-2 text-xs">
                {/* Yours on the left, theirs on the right, and the winning side
                    lit. Which way round is the whole readability of this. */}
                <span className={`w-14 text-right tabular-nums font-semibold ${
                  row.winner === "me" ? "text-(--color-highlight-text)" : "text-(--color-text-muted)"
                }`}>
                  {cellValue(row.key, row.mine)}
                </span>
                <span className="flex-1 min-w-0 text-center text-(--color-silver)" title={row.note}>
                  {row.label}
                </span>
                <span className={`w-14 tabular-nums font-semibold ${
                  row.winner === "them" ? "text-(--color-highlight-text)" : "text-(--color-text-muted)"
                }`}>
                  {cellValue(row.key, row.theirs)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="panel-raised rounded-md px-3 py-2 text-center">
      <p className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">{label}</p>
      <p className="text-sm font-semibold text-(--color-silver) mt-0.5">{value}</p>
    </div>
  );
}

/**
 * One player, at a glance: what their record is and what they last played.
 *
 * Deliberately short. The full read — VPIP, 3-bet, fold to c-bet — belongs at
 * the table where you are using it against them; here the question is closer to
 * "how have they been doing", which four numbers and five results answer.
 *
 * Drawn through a portal. It opens from inside the watch panel, and every
 * .panel carries a backdrop-filter — which makes a stacking context, so a
 * full-screen overlay rendered in there was sealed into a box the size of the
 * panel and the league card below simply painted over it.
 */
export default function PlayerProfileModal({ username, onClose, onFriendshipChange }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get(`/auth/players/${encodeURIComponent(username)}/`)
      .then(({ data }) => { if (!cancelled) setProfile(data); })
      .catch(() => { if (!cancelled) setError("Could not load that player."); });
    return () => { cancelled = true; };
  }, [username]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /**
   * The one button, in its four states.
   *
   * "Add" asks. "Yes" is the same call — pressing add on somebody who has
   * already asked you can only mean yes, and the server reads it that way.
   * "Asked" and "Friends" both undo, which is the same row going away either
   * way: taking back an ask and unfriending are not different operations, they
   * just look different from where you are standing.
   */
  const change = async () => {
    setBusy(true);
    try {
      if (standing === "friends" || standing === "asked") {
        await api.delete(`/auth/friends/${encodeURIComponent(username)}/`);
      } else {
        await api.post("/auth/friends/", { username });
      }
      // Re-read rather than guess: saying yes to an ask makes you friends,
      // which is not the state a flipped flag would have landed on. It also
      // brings the battle with it, which only exists between friends.
      const { data } = await api.get(`/auth/players/${encodeURIComponent(username)}/`);
      setProfile(data);
      onFriendshipChange?.();
    } catch {
      setError("That did not save.");
    } finally {
      setBusy(false);
    }
  };

  const stats = profile?.stats;
  const standing = profile?.friendship || "none";
  // What the button says in each of the four states, and whether pressing it
  // gives something up. See accounts/friends.py for where the words come from.
  const FRIEND_BUTTON = {
    none: { label: "Add", quiet: false },
    asked: { label: "Asked", quiet: true },
    asked_you: { label: "Yes", quiet: false },
    friends: { label: "Friends", quiet: true },
  }[standing];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div
        className="panel panel-solid rounded-xl w-full max-w-sm p-4 shadow-2xl shadow-black/60
                   max-h-[85dvh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        {error && <p className="text-sm text-(--color-accent-link)">{error}</p>}
        {!profile && !error && <p className="text-sm text-(--color-text-muted)">Loading…</p>}

        {profile && (
          <>
            <div className="flex items-center gap-3">
              <Avatar
                url={profile.avatar_url}
                emoji={profile.avatar_emoji}
        border={profile.avatar_border}
                name={profile.display_name || profile.username}
                className="w-11 h-11 shrink-0 rounded-full panel-raised"
                emojiClassName="text-2xl"
              />
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-(--color-silver) truncate">
                  {profile.display_name || profile.username}
                </h2>
                <Presence profile={profile} />
                {/* Who they play with, and a way into it. Same tab here,
                    unlike the card at the table: there is no hand to walk out
                    of from the lobby. */}
                {profile.clubs?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {profile.clubs.map((club) => (
                      <Link
                        key={club.slug}
                        to={`/clubs/${club.slug}`}
                        onClick={onClose}
                        title={`Open ${club.name}`}
                        className="panel-raised rounded-full pl-1 pr-2 py-0.5 flex items-center gap-1
                                   text-[10px] text-(--color-silver) border border-transparent
                                   hover:border-(--color-highlight) transition-colors"
                      >
                        <span className="text-xs leading-none">{club.emoji}</span>
                        <span className="max-w-[7rem] truncate">{club.name}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              {/* Nothing at all on your own card: the app knows which of these
                  is you, and an "Add" button on yourself is a joke that only
                  lands once. */}
              {FRIEND_BUTTON && (
                <button
                  type="button"
                  onClick={change}
                  disabled={busy}
                  title={{
                    none: `Ask ${profile.display_name || username} to be friends`,
                    asked: "Asked — press to take it back",
                    asked_you: `${profile.display_name || username} asked you`,
                    friends: "Friends — press to end it",
                  }[standing]}
                  className={`shrink-0 px-3 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-50 ${
                    FRIEND_BUTTON.quiet ? "btn-secondary" : "btn-accent"
                  }`}
                >
                  {FRIEND_BUTTON.label}
                </button>
              )}
            </div>

            {/* The offer only exists while there is somewhere to go. On the
                tournament's own page the standings keep refreshing, and if you
                are in it yourself it hands you back your seat. */}
            {profile.tournament && (
              <Link
                to={`/tournament/${profile.tournament.id}`}
                onClick={onClose}
                className="btn-accent block mt-3 px-4 py-2 rounded text-center text-sm font-semibold transition-colors"
              >
                Go to {profile.tournament.name}
              </Link>
            )}

            {profile.battle && (
              <FriendsBattle battle={profile.battle} them={profile.display_name || username} />
            )}

            <div className="grid grid-cols-2 gap-2 mt-4">
              <Stat label="Played" value={stats.tournaments_played} />
              <Stat label="Best" value={stats.best_finish ? ordinal(stats.best_finish) : "—"} />
              <Stat label="Cashes" value={stats.cashes} />
              <Stat label="Hands" value={(stats.hands_played || 0).toLocaleString()} />
            </div>

            <GameStats stats={stats} />

            <h3 className="text-[10px] uppercase tracking-wide text-(--color-text-muted) mt-4 mb-1">
              Last tournaments
            </h3>
            {profile.recent.length === 0 ? (
              <p className="text-xs text-(--color-text-muted)">Nothing finished yet.</p>
            ) : (
              <ol className="panel-raised rounded-lg divide-y divide-(--color-border)">
                {profile.recent.map((row) => (
                  <li key={row.tournament_id} className="px-3 py-2 flex items-center gap-2 text-xs">
                    <span className={`font-mono w-8 shrink-0 ${
                      row.finish_position === 1 ? "text-(--color-highlight-text)" : "text-(--color-text-muted)"
                    }`}>
                      {row.finish_position ? ordinal(row.finish_position) : "—"}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-(--color-silver)">{row.name}</span>
                    {row.prize_cents > 0 && (
                      <span className="text-(--color-highlight-text) shrink-0">{euros(row.prize_cents)}</span>
                    )}
                    <span className="text-(--color-text-muted) shrink-0 hidden sm:inline">
                      {formatDate(row.played_at)}
                    </span>
                  </li>
                ))}
              </ol>
            )}

            <button
              type="button"
              onClick={onClose}
              className="btn-secondary w-full mt-4 px-4 py-2 rounded font-semibold text-sm transition-colors"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
