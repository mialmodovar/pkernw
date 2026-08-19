import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import api from "../api/http";
import ClubMembers from "../components/lobby/ClubMembers";
import ClubSettings from "../components/lobby/ClubSettings";
import ScoringEditor from "../components/lobby/ScoringEditor";
import { leaveState } from "../components/lobby/clubRoles";
import { describeScheme } from "../components/lobby/leagueScoring";
import useAuthStore from "../store/authStore";

const euros = (cents) => `${(cents / 100).toFixed(2)}€`;

const formatDate = (value) => (value
  ? new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(new Date(value))
  : "");

function StandingsTable({ rows, empty = "Nothing played yet. The table fills in as nights finish." }) {
  if (!rows.length) {
    return <p className="text-sm text-(--color-text-muted) py-4">{empty}</p>;
  }
  return (
    <div className="panel-raised rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">
            <th className="px-2 py-2 text-left w-8">#</th>
            <th className="px-2 py-2 text-left">Player</th>
            <th className="px-2 py-2 text-right">Pts</th>
            <th className="px-2 py-2 text-right">Played</th>
            <th className="px-2 py-2 text-right">Won</th>
            <th className="px-2 py-2 text-right">KOs</th>
            <th className="px-2 py-2 text-right">€</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.username} className="border-t border-(--color-border)">
              <td className={`px-2 py-1.5 font-mono ${
                index === 0 ? "text-(--color-highlight-text)" : "text-(--color-text-muted)"
              }`}>
                {index + 1}
              </td>
              <td className="px-2 py-1.5 text-(--color-silver) truncate" title={row.username}>
                {row.display_name || row.username}
              </td>
              <td className="px-2 py-1.5 text-right font-semibold text-(--color-highlight-text) tabular-nums">
                {row.points}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-(--color-text-muted)">{row.played}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-(--color-text-muted)">{row.wins}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-(--color-text-muted)">{row.knockouts}</td>
              <td className={`px-2 py-1.5 text-right tabular-nums ${
                row.net_cents >= 0 ? "text-(--color-silver)" : "text-(--color-accent-link)"
              }`}>
                {row.net_cents ? euros(row.net_cents) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One club: who is in it, what it runs, and how those tables stand.
 *
 * Leagues are tabs rather than pages of their own. A club with two leagues is
 * still one thing you are looking at, and the season selector below the tabs is
 * the only other axis there is.
 */
export default function ClubPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [club, setClub] = useState(null);
  const [leagueId, setLeagueId] = useState(null);
  const [seasonId, setSeasonId] = useState(null);
  const [table, setTable] = useState(null);
  const [error, setError] = useState("");
  const [editingScoring, setEditingScoring] = useState(false);
  const [draftScoring, setDraftScoring] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [history, setHistory] = useState([]);
  const [joining, setJoining] = useState(false);
  const [managing, setManaging] = useState(false);
  const [editingLeague, setEditingLeague] = useState(false);

  const loadClub = useCallback(async () => {
    try {
      const { data } = await api.get(`/clubs/${slug}/`);
      setClub(data);
      setLeagueId((current) => current ?? data.leagues.find((l) => !l.is_archived)?.id ?? null);
    } catch {
      setError("That club could not be loaded.");
    }
  }, [slug]);

  useEffect(() => { loadClub(); }, [loadClub]);

  // The club's own two records: who is best across everything it has ever run,
  // and what it has run. Both survive a club with no leagues at all.
  const loadRecords = useCallback(async () => {
    try {
      const [board, nights] = await Promise.all([
        api.get(`/clubs/${slug}/leaderboard/`),
        api.get(`/clubs/${slug}/tournaments/`),
      ]);
      setLeaderboard(board.data.rows || []);
      setHistory(nights.data || []);
    } catch {
      // The page is worth reading without them.
    }
  }, [slug]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const loadTable = useCallback(async () => {
    if (!leagueId) { setTable(null); return; }
    try {
      const { data } = await api.get(`/clubs/leagues/${leagueId}/standings/`, {
        params: seasonId ? { season: seasonId } : {},
      });
      setTable(data);
      setSeasonId((current) => current ?? data.season.id);
    } catch {
      setTable(null);
    }
  }, [leagueId, seasonId]);

  useEffect(() => { loadTable(); }, [loadTable]);

  // Asked of the server rather than worked out from the role: the superuser has
  // no role in anybody's club and may still do everything in it.
  const isStaff = Boolean(club?.can_manage);
  const isMember = Boolean(club?.my_role);
  const leaving = club ? leaveState(club) : { can: false, reason: null };

  const join = async () => {
    setJoining(true);
    try {
      await api.post(`/clubs/${slug}/join/`);
      await loadClub();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not join that club.");
    } finally {
      setJoining(false);
    }
  };
  const league = useMemo(
    () => club?.leagues.find((one) => one.id === leagueId) || null,
    [club, leagueId],
  );

  const leave = async () => {
    if (!window.confirm(`Leave ${club.name}? Your results stay in its tables.`)) return;
    try {
      await api.delete(`/clubs/${slug}/leave/`);
      navigate("/clubs");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not leave that club.");
    }
  };

  const saveLeague = async (changes) => {
    await api.patch(`/clubs/leagues/${leagueId}/`, changes);
    setEditingLeague(false);
    await loadClub();
  };

  const archiveLeague = async () => {
    if (!window.confirm(`Shelve ${league.name}? Its tables stay readable, and it stops `
      + "being offered for new nights. You can bring it back from here.")) return;
    await saveLeague({ is_archived: true });
    setLeagueId(null);
  };

  const addLeague = async () => {
    const name = window.prompt("What is this league called?", "Sunday League");
    if (!name) return;
    await api.post(`/clubs/${slug}/leagues/`, { name });
    await loadClub();
  };

  const closeSeason = async () => {
    const name = window.prompt("Name the new season", "Season 2");
    if (name === null) return;
    await api.post(`/clubs/leagues/${leagueId}/seasons/`, { name });
    setSeasonId(null);
    await loadClub();
    await loadTable();
  };

  const saveScoring = async () => {
    await api.patch(`/clubs/seasons/${table.season.id}/`, { scoring: draftScoring });
    setEditingScoring(false);
    await loadTable();
  };

  if (error) return <p className="max-w-3xl mx-auto px-4 py-16 text-center text-(--color-text-muted)">{error}</p>;
  if (!club) return <p className="max-w-3xl mx-auto px-4 py-16 text-center text-(--color-text-muted)">Loading…</p>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      <button
        type="button"
        onClick={() => navigate("/clubs")}
        className="text-sm text-(--color-text-muted) hover:text-(--color-silver) transition-colors"
      >
        All clubs
      </button>

      <header className="panel rounded-lg p-4 flex flex-wrap items-center gap-3">
        <span className="text-4xl leading-none">{club.emoji}</span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-(--color-silver) truncate">{club.name}</h1>
          <p className="text-xs text-(--color-text-muted)">
            {club.member_count} member{club.member_count === 1 ? "" : "s"}
            {/* Worth saying on the club's own page: it is the difference between
                a code being a convenience and being the only way in. */}
            {!club.is_public && " · private"}
            {club.description && ` · ${club.description}`}
          </p>
        </div>
        {/* Only members see the code, and only they can pass it on. */}
        {club.invite_code && (
          <span
            title="Give this to somebody to let them in"
            className="shrink-0 panel-raised rounded px-2 py-1 font-mono text-sm text-(--color-highlight-text)"
          >
            {club.invite_code}
          </span>
        )}
        {!isMember && club.is_public && (
          <button
            onClick={join}
            disabled={joining}
            className="btn-accent px-4 py-1.5 rounded text-sm font-semibold transition-colors shrink-0
                       disabled:opacity-50"
          >
            {joining ? "Joining…" : "Join club"}
          </button>
        )}
        {isStaff && (
          <button
            onClick={() => navigate("/tournaments/new")}
            className="btn-accent px-3 py-1.5 rounded text-sm font-semibold transition-colors shrink-0"
          >
            New tournament
          </button>
        )}
        {isStaff && (
          <button
            onClick={() => setManaging((open) => !open)}
            aria-pressed={managing}
            className="btn-secondary px-3 py-1.5 rounded text-sm font-semibold transition-colors shrink-0"
          >
            {managing ? "Done" : "Manage"}
          </button>
        )}
      </header>

      {/* Everything about running the club, folded away until asked for: most
          visits are to read a table, not to rename anything. */}
      {isStaff && managing && (
        <ClubSettings
          club={club}
          onSaved={(updated) => setClub(updated)}
          onDeleted={() => navigate("/clubs")}
        />
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Shelved leagues stay visible to whoever runs the club, or shelving
              one would be a way of losing it: its tables are still there, and
              somebody has to be able to reach them to bring it back. */}
          {club.leagues.filter((one) => !one.is_archived || isStaff).map((one) => (
            <button
              key={one.id}
              onClick={() => { setLeagueId(one.id); setSeasonId(null); }}
              title={one.is_archived ? "Shelved — not offered for new nights" : one.description || undefined}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                one.id === leagueId
                  ? "bg-(--color-accent) text-(--color-accent-text) border-(--color-border-strong)"
                  : "panel-raised text-(--color-text-muted) border-(--color-border) hover:text-(--color-silver)"
              } ${one.is_archived && one.id !== leagueId ? "opacity-50" : ""}`}
            >
              {one.emoji} {one.name}
              {one.is_archived && <span className="ml-1 opacity-70">· shelved</span>}
            </button>
          ))}
          {isStaff && (
            <button
              onClick={addLeague}
              className="px-3 py-1 rounded-full text-xs font-semibold text-(--color-text-muted)
                         hover:text-(--color-silver) transition-colors"
            >
              + League
            </button>
          )}
        </div>

        {!league ? (
          <p className="text-sm text-(--color-text-muted)">
            No leagues yet.{isStaff ? " Add one and its first season opens with it." : ""}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="input-field rounded px-2 py-1 text-sm transition-colors"
                value={seasonId ?? ""}
                onChange={(event) => setSeasonId(Number(event.target.value))}
              >
                {league.seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}{season.is_open ? "" : " (closed)"}
                  </option>
                ))}
              </select>
              {isStaff && (
                <button
                  onClick={() => setEditingLeague((open) => !open)}
                  aria-pressed={editingLeague}
                  title="Rename this league, or shelve it"
                  className="btn-secondary px-3 py-1 rounded text-xs font-semibold transition-colors"
                >
                  {editingLeague ? "Cancel" : "League"}
                </button>
              )}
              {isStaff && table?.season?.is_open && (
                <>
                  <button
                    onClick={() => { setDraftScoring(table.season.scoring); setEditingScoring((v) => !v); }}
                    className="btn-secondary px-3 py-1 rounded text-xs font-semibold transition-colors"
                  >
                    {editingScoring ? "Cancel" : "Scoring"}
                  </button>
                  <button
                    onClick={closeSeason}
                    title="Freeze this table and open the next season"
                    className="btn-secondary px-3 py-1 rounded text-xs font-semibold transition-colors"
                  >
                    End season
                  </button>
                </>
              )}
              {table?.season && !editingScoring && (
                <span className="text-[11px] text-(--color-text-muted) ml-auto">
                  {describeScheme(table.season.scoring)}
                </span>
              )}
            </div>

            {editingLeague && (
              <LeagueEditor
                league={league}
                onSave={saveLeague}
                onArchive={archiveLeague}
                onRestore={() => saveLeague({ is_archived: false })}
              />
            )}

            {editingScoring && draftScoring && (
              <div className="panel rounded-lg p-3 space-y-3">
                <ScoringEditor scoring={draftScoring} onChange={setDraftScoring} />
                <div className="flex justify-end">
                  <button
                    onClick={saveScoring}
                    className="btn-accent px-4 py-1.5 rounded text-sm font-semibold transition-colors"
                  >
                    Save scoring
                  </button>
                </div>
              </div>
            )}

            <StandingsTable rows={table?.rows || []} />

            {table?.season?.prizes?.length > 0 && (
              <div className="panel rounded-lg p-3">
                <h3 className="text-[10px] uppercase tracking-wide text-(--color-text-muted) mb-1">
                  Season prize
                </h3>
                {table.season.prizes.map((prize) => (
                  <p key={prize.place} className="text-sm text-(--color-silver)">
                    {prize.label} — {euros(prize.amount_cents)}
                  </p>
                ))}
                <p className="text-[11px] text-(--color-text-muted) mt-1">
                  Paid by the club. The app only writes it down.
                </p>
              </div>
            )}
          </>
        )}
      </section>

      {/* All time, across every league and season. The season table above
          answers who is winning now; this answers who is the best player in
          the club, which is the argument people actually have. */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-(--color-text-muted)">
          Club leaderboard
        </h2>
        <StandingsTable
          rows={leaderboard}
          empty="Nothing to rank yet — it builds as the club plays."
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-(--color-text-muted)">
          Nights
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-(--color-text-muted)">Nothing run yet.</p>
        ) : (
          <ol className="panel-raised rounded-lg divide-y divide-(--color-border)">
            {history.map((night) => (
              <li key={night.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/tournament/${night.id}`)}
                  className="w-full px-3 py-2 flex items-center gap-2 text-xs text-left
                             hover:bg-white/5 transition-colors"
                >
                  <span className="text-(--color-text-muted) shrink-0 w-16">
                    {night.played_at ? formatDate(night.played_at) : ""}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-(--color-silver)">
                    {night.name}
                    {night.league_name && (
                      <span className="text-(--color-text-muted)"> · {night.league_name}</span>
                    )}
                  </span>
                  {night.winner ? (
                    <span className="text-(--color-highlight-text) shrink-0">🏆 {night.winner}</span>
                  ) : (
                    <span className="text-(--color-text-muted) shrink-0">{night.status}</span>
                  )}
                  <span className="text-(--color-text-muted) shrink-0 hidden sm:inline">
                    {night.entrants}p
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <ClubMembers club={club} myUsername={user?.username} onChanged={loadClub} />

      {/* On the way out. An owner is told to hand the club over rather than
          offered a button that the server would refuse. */}
      {isMember && (
        <div className="flex items-center justify-end gap-3 pb-2">
          {leaving.reason && (
            <span className="text-[11px] text-(--color-text-muted)">{leaving.reason}</span>
          )}
          <button
            type="button"
            onClick={leave}
            disabled={!leaving.can}
            className="px-3 py-1.5 rounded text-xs font-semibold text-(--color-text-muted)
                       hover:text-(--color-accent-link) transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Leave club
          </button>
        </div>
      )}
    </div>
  );
}

/** Renaming a league, changing its face, or shelving it. */
function LeagueEditor({ league, onSave, onArchive, onRestore }) {
  const [name, setName] = useState(league.name);
  const [emoji, setEmoji] = useState(league.emoji);
  const [description, setDescription] = useState(league.description || "");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await onSave({ name: name.trim(), emoji, description: description.trim() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="panel rounded-lg p-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          value={emoji}
          onChange={(event) => setEmoji(event.target.value)}
          aria-label="League emoji"
          className="input-field rounded px-2 py-1.5 text-lg w-14 text-center transition-colors"
        />
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="League name"
          className="input-field rounded px-3 py-1.5 text-sm flex-1 min-w-40 transition-colors"
        />
      </div>
      <input
        value={description}
        maxLength={200}
        placeholder="What this league is for"
        onChange={(event) => setDescription(event.target.value)}
        aria-label="League description"
        className="input-field w-full rounded px-3 py-1.5 text-sm transition-colors"
      />
      <div className="flex items-center justify-between gap-2">
        {league.is_archived ? (
          <button
            type="button"
            onClick={onRestore}
            title="Run it again — it goes back to being offered for new nights"
            className="px-2.5 py-1 rounded text-xs font-semibold text-(--color-highlight-text)
                       hover:underline transition-colors"
          >
            Bring it back
          </button>
        ) : (
          <button
            type="button"
            onClick={onArchive}
            title="Keep its tables, stop running it"
            className="px-2.5 py-1 rounded text-xs font-semibold text-(--color-text-muted)
                       hover:text-(--color-accent-link) transition-colors"
          >
            Shelve league
          </button>
        )}
        <button
          type="submit"
          disabled={busy || name.trim().length < 2}
          className="btn-accent px-4 py-1.5 rounded text-xs font-semibold transition-colors
                     disabled:opacity-50"
        >
          Save league
        </button>
      </div>
    </form>
  );
}
