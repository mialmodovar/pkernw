import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Avatar from "../Avatar";
import Icon from "../icons/Icon";
import api from "../../api/http";
import PlayerProfileModal from "./PlayerProfileModal";

// Long enough not to hammer the server from an idle lobby, short enough that
// somebody sitting down at a table shows up here while you are still looking.
const REFRESH_MS = 20_000;

/**
 * Your friends, as a row of faces.
 *
 * This was the watch panel, and it was a list you kept to yourself: you added
 * somebody, they were never told, and neither of you could see anything about
 * the other. A friendship is agreed instead, which costs one tap and buys two
 * things watching could not — they know, and there is a Friends Battle on their
 * card, which is the only statistic anybody at a home game actually argues
 * about.
 *
 * A row of avatars rather than a list of names: the only thing anybody does
 * with this list is pick somebody out of it, and names would take the whole
 * sidebar to say what one line of faces says. A ring marks whoever is at a
 * table, a dot marks whoever is connected — the two are not the same, since a
 * seat can sit disconnected for a whole level — and anyone playing gets a line
 * underneath naming the tournament.
 *
 * Asks you have received sit above all of it. They are the only thing here that
 * wants doing something about, and a friend request nobody ever notices is the
 * whole feature failing quietly.
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

/** One face, in the row. */
function Face({ player, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(player.username)}
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
        border={player.avatar_border}
        name={player.username}
        className="w-full h-full rounded-full"
        emojiClassName="text-2xl"
      />
      {player.online && <OnlineDot />}
    </button>
  );
}

export default function FriendsPanel() {
  const [lists, setLists] = useState({ friends: [], incoming: [], outgoing: [] });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/friends/");
      setLists({
        friends: data.friends || [],
        incoming: data.incoming || [],
        outgoing: data.outgoing || [],
      });
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

  const ask = async (username) => {
    setError("");
    try {
      // The same call answers an ask and sends one: pressing "Add" on somebody
      // who has already asked you can only mean yes. See accounts/friends.py.
      const { data } = await api.post("/auth/friends/", { username });
      setLists(data);
      setName("");
      setAdding(false);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not add that player.");
    }
  };

  const part = async (username) => {
    setError("");
    try {
      await api.delete(`/auth/friends/${encodeURIComponent(username)}/`);
      await load();
    } catch {
      setError("That did not save.");
    }
  };

  const { friends, incoming, outgoing } = lists;
  const atTables = friends.filter((player) => player.tournament);

  return (
    <div className="panel rounded-lg p-4 space-y-3 shadow-lg shadow-black/40">
      <div className="flex items-baseline justify-between gap-2">
        {/* The same two figures the phone's strip puts on the button that
            opens this. It used to be an eye, which is the app's mark for
            watching a table you are not sat at. */}
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-(--color-silver) uppercase tracking-wide">
          <Icon name="friends" className="w-4 h-4" tone="gold" />
          Friends
        </h2>
        <button
          type="button"
          onClick={() => { setAdding((open) => !open); setError(""); }}
          className="text-xs text-(--color-text-muted) hover:text-(--color-silver) transition-colors"
        >
          {adding ? "Cancel" : "+ Add"}
        </button>
      </div>

      {adding && (
        <form
          onSubmit={(event) => { event.preventDefault(); if (name.trim()) ask(name.trim()); }}
          className="flex gap-1.5"
        >
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Username"
            aria-label="Player to add as a friend"
            className="input-field flex-1 min-w-0 rounded px-2 py-1 text-xs transition-colors"
          />
          <button type="submit" className="btn-accent px-2.5 py-1 rounded text-xs font-semibold transition-colors">
            Ask
          </button>
        </form>
      )}

      {error && <p className="text-xs text-(--color-accent-link)">{error}</p>}

      {/* Above everything, because it is the only thing here that is waiting on
          you. Two buttons and no menu: yes and no are the whole decision. */}
      {incoming.length > 0 && (
        <ul className="space-y-1.5">
          {incoming.map((player) => (
            <li key={player.username} className="flex items-center gap-2">
              <Avatar
                url={player.avatar_url}
                emoji={player.avatar_emoji}
                border={player.avatar_border}
                name={player.username}
                className="w-7 h-7 shrink-0 rounded-full panel-raised"
                emojiClassName="text-base"
              />
              <span className="flex-1 min-w-0 truncate text-xs text-(--color-silver)">
                {player.display_name || player.username}
                <span className="text-(--color-text-muted)"> wants to be friends</span>
              </span>
              <button
                type="button"
                onClick={() => ask(player.username)}
                className="btn-accent shrink-0 px-2 py-0.5 rounded text-xs font-semibold transition-colors"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => part(player.username)}
                title="Turn it down"
                className="btn-secondary shrink-0 px-2 py-0.5 rounded text-xs font-semibold transition-colors"
              >
                No
              </button>
            </li>
          ))}
        </ul>
      )}

      {friends.length === 0 ? (
        <p className="text-xs text-(--color-text-muted)">
          Nobody yet. Add a player here, or tap a seat at a table and ask them from there.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {friends.map((player) => (
            <Face key={player.username} player={player} onOpen={setViewing} />
          ))}
        </div>
      )}

      {/* Asks of your own, faded: there is nothing to do about one but wait,
          and taking it back is the only button it needs. */}
      {outgoing.length > 0 && (
        <p className="text-[11px] text-(--color-text-muted) leading-relaxed">
          Waiting on{" "}
          {outgoing.map((player, index) => (
            <span key={player.username}>
              {index > 0 && ", "}
              <button
                type="button"
                onClick={() => part(player.username)}
                title="Take the ask back"
                className="underline decoration-dotted hover:text-(--color-silver) transition-colors"
              >
                {player.display_name || player.username}
              </button>
            </span>
          ))}
        </p>
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
          onFriendshipChange={load}
        />
      )}
    </div>
  );
}
