import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Avatar from "../Avatar";
import api from "../../api/http";
import PlayerProfileModal from "./PlayerProfileModal";

// Long enough not to hammer the server from an idle lobby, short enough that
// somebody sitting down at a table shows up here while you are still looking.
const REFRESH_MS = 20_000;

/**
 * The players you keep an eye on, as a row of faces.
 *
 * A list of names would take the whole sidebar to say what a row of avatars
 * says in one line, and the only thing you do with this list is pick somebody
 * out of it. A ring marks whoever is at a table, a dot marks whoever is
 * actually connected — the two are not the same, since a seat can sit
 * disconnected for a whole level — and anyone playing gets a line underneath
 * naming the tournament, which is the thing you would otherwise have to go
 * hunting through the lobby for.
 */
/** Connected right now. Sits on the rim of the face rather than beside it,
 *  which is where every other app puts it and where it costs no room. */
function OnlineDot() {
  return (
    <span
      aria-hidden="true"
      className="absolute -bottom-px -right-px w-3 h-3 rounded-full bg-[#4ea96a]
                 border-2 border-(--color-surface-sunken)"
    />
  );
}

/** What the face says on hover — the whole of what is known about where they
 *  are, in one line. */
function presenceLine(player) {
  const where = player.tournament
    ? `${player.tournament.status === "paused" ? "sat in" : "playing"} ${player.tournament.name}`
    : null;
  const who = player.display_name || player.username;
  if (player.online && where) return `${who} — online, ${where}`;
  if (where) return `${who} — ${where}, but not connected`;
  if (player.online) return `${who} — online`;
  return `${who} — offline`;
}

export default function WatchPanel() {
  const [watched, setWatched] = useState([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/watching/");
      setWatched(data);
    } catch {
      // The lobby is fine without it, and the next visit retries.
    }
  }, []);

  // Presence goes stale on its own, so the list re-reads itself while the
  // lobby is open rather than only when it is first drawn.
  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const add = async (event) => {
    event.preventDefault();
    const username = name.trim();
    if (!username) return;
    setError("");
    try {
      const { data } = await api.post("/auth/watching/", { username });
      setWatched(data);
      setName("");
      setAdding(false);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not add that player.");
    }
  };

  const atTables = watched.filter((player) => player.tournament);

  return (
    <div className="panel rounded-lg p-4 space-y-3 shadow-lg shadow-black/40">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-(--color-silver) uppercase tracking-wide">Watching</h2>
        <button
          type="button"
          onClick={() => { setAdding((open) => !open); setError(""); }}
          className="text-xs text-(--color-text-muted) hover:text-(--color-silver) transition-colors"
        >
          {adding ? "Cancel" : "+ Add"}
        </button>
      </div>

      {adding && (
        <form onSubmit={add} className="flex gap-1.5">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Username"
            aria-label="Player to watch"
            className="input-field flex-1 min-w-0 rounded px-2 py-1 text-xs transition-colors"
          />
          <button type="submit" className="btn-accent px-2.5 py-1 rounded text-xs font-semibold transition-colors">
            Watch
          </button>
        </form>
      )}

      {error && <p className="text-xs text-(--color-accent-link)">{error}</p>}

      {watched.length === 0 ? (
        <p className="text-xs text-(--color-text-muted)">
          Nobody yet. Add a player here, or tap a seat at a table and watch them from there.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {watched.map((player) => (
            <button
              key={player.username}
              type="button"
              onClick={() => setViewing(player.username)}
              title={presenceLine(player)}
              className={`relative w-10 h-10 rounded-full panel-raised overflow-visible
                          transition-transform hover:scale-110 ${
                            player.playing_now
                              ? "ring-2 ring-(--color-highlight) ring-offset-1 ring-offset-black/60"
                              : ""
                          }`}
            >
              <Avatar
                url={player.avatar_url}
                emoji={player.avatar_emoji}
                name={player.username}
                className="w-full h-full rounded-full"
                emojiClassName="text-2xl"
              />
              {player.online && <OnlineDot />}
            </button>
          ))}
        </div>
      )}

      {/* Where to go if you want to see it. The tournament page is live —
          stacks, standings and blinds refresh while it is open — and if you are
          in the tournament yourself it takes you to your own seat. */}
      {atTables.length > 0 && (
        <ul className="space-y-1 pt-1 border-t border-(--color-border)">
          {atTables.map((player) => (
            <li key={player.username} className="flex items-center gap-2 text-xs">
              <span className="shrink-0 font-semibold text-(--color-silver) truncate max-w-[6rem]">
                {player.display_name || player.username}
              </span>
              <span className="flex-1 min-w-0 truncate text-(--color-text-muted)"
                title={player.tournament.name}>
                {player.tournament.name}
                {player.tournament.status === "paused" && " (paused)"}
              </span>
              <Link
                to={`/tournament/${player.tournament.id}`}
                className="btn-secondary shrink-0 px-2 py-0.5 rounded font-semibold transition-colors"
              >
                Watch
              </Link>
            </li>
          ))}
        </ul>
      )}

      {viewing && (
        <PlayerProfileModal
          username={viewing}
          onClose={() => setViewing(null)}
          onWatchChange={load}
        />
      )}
    </div>
  );
}
