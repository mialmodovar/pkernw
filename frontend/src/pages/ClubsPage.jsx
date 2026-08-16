import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../api/http";

const EMOJI_CHOICES = ["🎴", "🃏", "♠️", "♣️", "♥️", "♦️", "🏆", "🎲", "🔥", "🦈", "👑", "🍀"];

/** Start a club. Two fields and a face — a club is a name and the people in it. */
function CreateClub({ onCreated, onCancel }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🎴");
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError("Give the club a name.");
      return;
    }
    try {
      const { data } = await api.post("/clubs/", {
        name: name.trim(), emoji, is_public: isPublic,
      });
      onCreated(data);
    } catch (requestError) {
      setError(requestError.response?.data?.name?.[0] || "Could not create that club.");
    }
  };

  return (
    <form onSubmit={submit} className="panel rounded-lg p-4 space-y-3">
      <h2 className="font-semibold text-(--color-silver)">New club</h2>

      <div className="flex gap-2">
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Quinta Poker"
          aria-label="Club name"
          className="input-field flex-1 min-w-0 rounded px-3 py-2 text-sm transition-colors"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {EMOJI_CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => setEmoji(choice)}
            aria-pressed={emoji === choice}
            className={`w-9 h-9 rounded text-xl flex items-center justify-center transition-transform hover:scale-110 ${
              emoji === choice ? "panel-raised ring-2 ring-(--color-highlight)" : "panel-raised"
            }`}
          >
            {choice}
          </button>
        ))}
      </div>

      <label className="flex items-center justify-between text-sm">
        <span className="text-(--color-text-muted)">
          Anyone can find and join it
          <span className="block text-[11px]">Off means it takes the invite code.</span>
        </span>
        <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
      </label>

      {error && <p className="text-xs text-(--color-accent-link)">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary px-3 py-1.5 rounded text-sm transition-colors">
          Cancel
        </button>
        <button type="submit" className="btn-accent px-4 py-1.5 rounded text-sm font-semibold transition-colors">
          Create
        </button>
      </div>
    </form>
  );
}

/**
 * Every club you can see: the ones you are in, and the public ones you are not.
 *
 * A private club you are not in is not here at all — it is found with its code
 * or not at all, which is what makes it private.
 */
export default function ClubsPage() {
  const navigate = useNavigate();
  const [clubs, setClubs] = useState([]);
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/clubs/");
      setClubs(data);
    } catch {
      setError("Could not load clubs.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const joinByCode = async (event) => {
    event.preventDefault();
    if (!code.trim()) return;
    setError("");
    try {
      const { data } = await api.post("/clubs/join/", { code: code.trim() });
      navigate(`/clubs/${data.slug}`);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "That code did not work.");
    }
  };

  const join = async (club) => {
    setError("");
    try {
      await api.post(`/clubs/${club.slug}/join/`);
      navigate(`/clubs/${club.slug}`);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not join that club.");
    }
  };

  const mine = clubs.filter((club) => club.my_role);
  const others = clubs.filter((club) => !club.my_role);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-sm text-(--color-text-muted) hover:text-(--color-silver) transition-colors"
        >
          Back home
        </button>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="btn-accent px-4 py-2 rounded font-semibold text-sm transition-colors"
          >
            Start a club
          </button>
        )}
      </div>

      {creating && (
        <CreateClub
          onCancel={() => setCreating(false)}
          onCreated={(club) => navigate(`/clubs/${club.slug}`)}
        />
      )}

      <form onSubmit={joinByCode} className="panel rounded-lg p-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-(--color-text-muted)">Have an invite code?</span>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="ABC123"
          aria-label="Invite code"
          className="input-field rounded px-3 py-1.5 text-sm font-mono w-32 transition-colors"
        />
        <button type="submit" className="btn-secondary px-3 py-1.5 rounded text-sm font-semibold transition-colors">
          Join
        </button>
      </form>

      {error && <p className="text-sm text-(--color-accent-link)">{error}</p>}

      {mine.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-(--color-text-muted)">Your clubs</h2>
          {mine.map((club) => (
            <ClubRow key={club.slug} club={club} onOpen={() => navigate(`/clubs/${club.slug}`)} />
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-(--color-text-muted)">
          Open to join
        </h2>
        {others.length === 0 ? (
          <p className="text-sm text-(--color-text-muted)">
            Nothing open right now. Start one, or ask somebody for their code.
          </p>
        ) : (
          others.map((club) => (
            <ClubRow
              key={club.slug}
              club={club}
              onOpen={() => navigate(`/clubs/${club.slug}`)}
              onJoin={() => join(club)}
            />
          ))
        )}
      </section>
    </div>
  );
}

function ClubRow({ club, onOpen, onJoin }) {
  return (
    <div className="panel rounded-lg px-3 py-2 flex items-center gap-3 hover:border-(--color-border-strong) transition-colors">
      <span className="text-2xl leading-none shrink-0">{club.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-(--color-silver) truncate">{club.name}</p>
        <p className="text-xs text-(--color-text-muted) truncate">
          {club.member_count} member{club.member_count === 1 ? "" : "s"}
          {club.league_count > 0 && ` · ${club.league_count} league${club.league_count === 1 ? "" : "s"}`}
          {club.description && ` · ${club.description}`}
        </p>
      </div>
      {onJoin && (
        <button onClick={onJoin} className="btn-accent px-3 py-1 rounded text-xs font-semibold transition-colors shrink-0">
          Join
        </button>
      )}
      <button
        onClick={onOpen}
        className="px-2.5 py-1 panel-raised hover:border-(--color-border-strong) rounded text-xs
                   transition-colors text-(--color-silver) shrink-0"
      >
        Open
      </button>
    </div>
  );
}
