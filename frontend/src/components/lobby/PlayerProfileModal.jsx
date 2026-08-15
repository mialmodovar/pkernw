import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import api from "../../api/http";

const euros = (cents) => `${(cents / 100).toFixed(2)}€`;

const ordinal = (n) => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${suffix}`;
};

const formatDate = (value) => (value
  ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value))
  : "");

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
export default function PlayerProfileModal({ username, onClose, onWatchChange }) {
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

  const toggleWatch = async () => {
    setBusy(true);
    try {
      if (profile.is_watched) {
        await api.delete(`/auth/watching/${encodeURIComponent(username)}/`);
      } else {
        await api.post("/auth/watching/", { username });
      }
      setProfile((current) => ({ ...current, is_watched: !current.is_watched }));
      onWatchChange?.();
    } catch {
      setError("That did not save.");
    } finally {
      setBusy(false);
    }
  };

  const stats = profile?.stats;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div
        className="panel panel-solid rounded-xl w-full max-w-sm p-4 shadow-2xl shadow-black/60
                   max-h-[85vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        {error && <p className="text-sm text-(--color-accent-link)">{error}</p>}
        {!profile && !error && <p className="text-sm text-(--color-text-muted)">Loading…</p>}

        {profile && (
          <>
            <div className="flex items-center gap-3">
              <span className="text-3xl leading-none">{profile.avatar_emoji}</span>
              <h2 className="font-semibold text-(--color-silver) truncate flex-1">{profile.username}</h2>
              <button
                type="button"
                onClick={toggleWatch}
                disabled={busy}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-50 ${
                  profile.is_watched ? "btn-secondary" : "btn-accent"
                }`}
              >
                {profile.is_watched ? "Watching" : "Watch"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <Stat label="Played" value={stats.tournaments_played} />
              <Stat label="Best" value={stats.best_finish ? ordinal(stats.best_finish) : "—"} />
              <Stat label="Cashes" value={stats.cashes} />
              <Stat label="Hands" value={(stats.hands_played || 0).toLocaleString()} />
            </div>

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
