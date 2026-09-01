import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Icon from "../icons/Icon";
import api from "../../api/http";

/**
 * The clubs you are in, in the sidebar.
 *
 * Short on purpose: a name, its emoji, and how many people are in it. The club
 * page is one click away and has everything else, so this is a way in rather
 * than a summary — the same job the watch panel does for players.
 */
export default function ClubPanel({ onClubsLoaded }) {
  const navigate = useNavigate();
  const [clubs, setClubs] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/clubs/");
      setClubs(data);
      // Told upward rather than fetched twice: the lobby needs to know whether
      // this player organises anywhere, and this is the request that says so.
      onClubsLoaded?.(data);
    } catch {
      // The lobby is fine without it, and the next visit retries.
    } finally {
      setLoaded(true);
    }
  }, [onClubsLoaded]);

  useEffect(() => { load(); }, [load]);

  if (!loaded) return null;

  const mine = clubs.filter((club) => club.my_role);

  return (
    <div className="panel rounded-lg p-4 space-y-3 shadow-lg shadow-black/40">
      <div className="flex items-baseline justify-between gap-2">
        {/* The suit, the same one the phone's strip draws on the button that
            opens this — and the same one the header's Clubs button carries, so
            the two ways in at least look like one place. */}
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-(--color-silver) uppercase tracking-wide">
          <Icon name="clubs" className="w-4 h-4" tone="gold" />
          Clubs
        </h2>
        <button
          type="button"
          onClick={() => navigate("/clubs")}
          className="text-xs text-(--color-text-muted) hover:text-(--color-silver) transition-colors"
        >
          Browse
        </button>
      </div>

      {mine.length === 0 ? (
        <p className="text-xs text-(--color-text-muted)">
          Not in a club yet. Join one, or start your own and invite the usual crowd.
        </p>
      ) : (
        <div className="space-y-1">
          {mine.map((club) => (
            <button
              key={club.slug}
              type="button"
              onClick={() => navigate(`/clubs/${club.slug}`)}
              className="w-full flex items-center gap-2 p-1.5 rounded panel-raised text-left
                         hover:border-(--color-border-strong) transition-colors"
            >
              <span className="text-xl leading-none shrink-0">{club.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-(--color-silver) truncate">{club.name}</span>
                <span className="block text-[11px] text-(--color-text-muted)">
                  {club.member_count} member{club.member_count === 1 ? "" : "s"}
                  {club.league_count > 0 && ` · ${club.league_count} league${club.league_count === 1 ? "" : "s"}`}
                </span>
              </span>
              {/* Only worth saying when it means you can do something here. */}
              {club.my_role !== "member" && (
                <span className="shrink-0 text-[9px] uppercase tracking-wide text-(--color-highlight-text)">
                  {club.my_role}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
