import { useEffect, useState } from "react";

import api from "../../api/http";

/**
 * The clubs anybody can walk into, offered to somebody who has just arrived.
 *
 * A club is where the tournaments come from, so a new player with no club is a
 * new player with an empty Tournaments tab. Only the public ones are listed —
 * a private club is found with its code, which is the whole of what makes it
 * private — and the code box is here too, since being invited is the commonest
 * reason anybody signs up at all.
 */
export default function ClubsStep({ onDone, onSkip }) {
  const [clubs, setClubs] = useState(null);
  const [joined, setJoined] = useState([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get("/clubs/")
      .then(({ data }) => {
        if (cancelled) return;
        setClubs(data.filter((club) => !club.my_role));
        setJoined(data.filter((club) => club.my_role).map((club) => club.slug));
      })
      .catch(() => { if (!cancelled) setClubs([]); });
    return () => { cancelled = true; };
  }, []);

  const join = async (club) => {
    setError("");
    setBusy(club.slug);
    try {
      await api.post(`/clubs/${club.slug}/join/`);
      setJoined((current) => [...current, club.slug]);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not join that club.");
    } finally {
      setBusy(null);
    }
  };

  const joinByCode = async (event) => {
    event.preventDefault();
    if (!code.trim()) return;
    setError("");
    try {
      const { data } = await api.post("/clubs/join/", { code: code.trim() });
      setJoined((current) => [...current, data.slug]);
      setClubs((current) => (current || []).filter((club) => club.slug !== data.slug));
      setCode("");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "That code did not work.");
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-(--color-text-muted) leading-snug">
        Clubs are where the tournaments come from. Join one now or later — the lobby has the
        rest of them.
      </p>

      <form onSubmit={joinByCode} className="flex gap-2">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="Invite code"
          aria-label="Invite code"
          className="input-field flex-1 min-w-0 rounded px-3 py-2 text-sm font-mono transition-colors"
        />
        <button type="submit" className="btn-secondary px-3 py-2 rounded text-sm font-semibold transition-colors">
          Join
        </button>
      </form>

      <div className="space-y-2 max-h-56 overflow-y-auto">
        {clubs == null && <p className="text-sm text-(--color-text-muted)">Loading…</p>}
        {clubs?.length === 0 && (
          <p className="text-sm text-(--color-text-muted)">
            No clubs open to join yet. You can start one from the lobby.
          </p>
        )}
        {clubs?.map((club) => (
          <div key={club.slug} className="panel-raised rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="text-xl leading-none shrink-0">{club.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-(--color-silver) truncate">{club.name}</span>
              <span className="block text-[11px] text-(--color-text-muted) truncate">
                {club.member_count} member{club.member_count === 1 ? "" : "s"}
                {club.description && ` · ${club.description}`}
              </span>
            </span>
            <button
              type="button"
              disabled={joined.includes(club.slug) || busy === club.slug}
              onClick={() => join(club)}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors shrink-0 ${
                joined.includes(club.slug)
                  ? "text-(--color-highlight-text)"
                  : "btn-accent"
              }`}
            >
              {joined.includes(club.slug) ? "Joined" : "Join"}
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-(--color-accent-link)">{error}</p>}

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
          {joined.length > 0 ? "Next" : "Continue"}
        </button>
      </div>
    </div>
  );
}
