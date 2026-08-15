import { useCallback, useEffect, useState } from "react";

import api from "../../api/http";
import PlayerProfileModal from "./PlayerProfileModal";

/**
 * The players you keep an eye on, as a row of faces.
 *
 * A list of names would take the whole sidebar to say what a row of avatars
 * says in one line, and the only thing you do with this list is pick somebody
 * out of it. A ring marks whoever is at a table right now, which is the one
 * fact worth having before you click.
 */
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

  useEffect(() => { load(); }, [load]);

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
              title={player.playing_now ? `${player.username} — playing now` : player.username}
              className={`w-10 h-10 flex items-center justify-center text-2xl rounded-full panel-raised
                          transition-transform hover:scale-110 ${
                            player.playing_now
                              ? "ring-2 ring-(--color-highlight) ring-offset-1 ring-offset-black/60"
                              : ""
                          }`}
            >
              {player.avatar_emoji}
            </button>
          ))}
        </div>
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
