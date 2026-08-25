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
 * Your friends are how you know somebody is online and at a table, which is the
 * difference between a lobby that looks empty and one with your friends in it.
 * This suggests as you type, and matches the name they go by as well as the one
 * they signed up with — the only way to add anybody used to be knowing how to
 * spell their login name exactly.
 *
 * What it sends is an ask rather than a done deal: on the other side somebody
 * has to say yes, which is what makes the list mean anything.
 */
export default function FriendsStep({ onDone, onSkip }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [asked, setAsked] = useState([]);
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

  const ask = async (player) => {
    setAsked((current) => [...current, player.username]);
    setResults((current) => current.filter((one) => one.username !== player.username));
    try {
      await api.post("/auth/friends/", { username: player.username });
    } catch {
      // Take them back off rather than claiming an ask that never went.
      setAsked((current) => current.filter((name) => name !== player.username));
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-(--color-text-muted) leading-snug">
        Ask the people you play with to be friends. The lobby tells you when they are
        online and which table they are at, and their card keeps score between you.
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
            onClick={() => ask(player)}
            className="w-full panel-raised rounded-lg px-3 py-2 flex items-center gap-2 text-left
                       hover:border-(--color-border-strong) transition-colors"
          >
            <Avatar
              url={player.avatar_url}
              emoji={player.avatar_emoji}
            border={player.avatar_border}
              name={player.display_name}
              className="w-7 h-7 rounded-full shrink-0"
              emojiClassName="text-base"
            />
            <span className="min-w-0 flex-1 text-sm text-(--color-silver) truncate">
              {player.display_name}
            </span>
            <span className="text-xs text-(--color-highlight-text) shrink-0">Ask</span>
          </button>
        ))}
      </div>

      {asked.length > 0 && (
        <p className="text-xs text-(--color-highlight-text)">
          Asked {asked.length} player{asked.length === 1 ? "" : "s"}: {asked.join(", ")}
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
