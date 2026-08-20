import { useEffect, useRef, useState } from "react";

import Avatar from "../Avatar";
import api from "../../api/http";

// Long enough that typing a name is one request rather than six, short enough
// that the list feels like it is keeping up.
const DEBOUNCE_MS = 250;
// The server will not answer a single letter — see SEARCH_MIN in
// accounts/watching.py — so there is no point asking.
const MIN_QUERY = 2;

/**
 * Finding the people you actually play with.
 *
 * The watch list is how you know somebody is online and at a table, which is
 * the difference between a lobby that looks empty and one with your friends in
 * it. Until now the only way to add anybody was to know how to spell their
 * login name exactly; this suggests as you type, and matches the name they go
 * by as well as the one they signed up with.
 */
export default function WatchStep({ onDone, onSkip }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [watching, setWatching] = useState([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (query.trim().length < MIN_QUERY) {
      setResults([]);
      return undefined;
    }
    setSearching(true);
    timer.current = setTimeout(() => {
      api.get("/auth/players/search/", { params: { q: query.trim() } })
        .then(({ data }) => setResults(data))
        // A search that will not load is not worth an error over a step
        // somebody can skip; the next keystroke tries again.
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [query]);

  const follow = async (player) => {
    setWatching((current) => [...current, player.username]);
    setResults((current) => current.filter((one) => one.username !== player.username));
    try {
      await api.post("/auth/watching/", { username: player.username });
    } catch {
      // Put them back rather than claiming a follow that did not happen.
      setWatching((current) => current.filter((name) => name !== player.username));
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-(--color-text-muted) leading-snug">
        Follow the people you play with and the lobby will tell you when they are online and
        which table they are at.
      </p>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by name"
        aria-label="Search for players"
        className="input-field w-full rounded px-3 py-2 text-sm transition-colors"
      />

      <div className="space-y-1.5 min-h-24 max-h-48 overflow-y-auto">
        {query.trim().length >= MIN_QUERY && !searching && results.length === 0 && (
          <p className="text-sm text-(--color-text-muted)">Nobody by that name.</p>
        )}
        {results.map((player) => (
          <button
            key={player.username}
            type="button"
            onClick={() => follow(player)}
            className="w-full panel-raised rounded-lg px-3 py-2 flex items-center gap-2 text-left
                       hover:border-(--color-border-strong) transition-colors"
          >
            <Avatar
              url={player.avatar_url}
              emoji={player.avatar_emoji}
              name={player.display_name}
              className="w-7 h-7 rounded-full shrink-0"
              emojiClassName="text-base"
            />
            <span className="min-w-0 flex-1 text-sm text-(--color-silver) truncate">
              {player.display_name}
            </span>
            <span className="text-xs text-(--color-highlight-text) shrink-0">Follow</span>
          </button>
        ))}
      </div>

      {watching.length > 0 && (
        <p className="text-xs text-(--color-highlight-text)">
          Following {watching.length} player{watching.length === 1 ? "" : "s"}: {watching.join(", ")}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSkip}
          className="btn-secondary flex-1 py-2 rounded text-sm font-semibold transition-colors"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={onDone}
          className="btn-accent flex-1 py-2 rounded text-sm font-semibold transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
