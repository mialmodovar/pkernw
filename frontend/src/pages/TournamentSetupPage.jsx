import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/http";
import useAuthStore from "../store/authStore";

const formatScheduledStart = (value) => {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
};

const formatTimeBankRefill = (tournament) => {
  if (!tournament.time_bank_seconds) return "Time bank disabled";
  if (tournament.time_bank_refill_rule === "hands") {
    return `Refills every ${tournament.time_bank_refill_every_hands} hands`;
  }
  if (tournament.time_bank_refill_rule === "blind_level") {
    return `Refills at blind level ${tournament.time_bank_refill_level}`;
  }
  return "No refill";
};

const formatPayoutLabel = (row) => row.label || `Place ${row.place}`;

export default function TournamentSetupPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [tournament, setTournament] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data } = await api.get(`/tournaments/${id}/`);
    setTournament(data);
    if (data.status === "running") navigate(`/tournament/${id}/play`);
  }, [id, navigate]);

  useEffect(() => { load(); const iv = setInterval(load, 3000); return () => clearInterval(iv); }, [load]);

  if (!tournament) return <p className="text-center mt-10 text-(--color-text-muted)">Loading...</p>;

  const isHost = tournament.host_name === user?.username;
  const joined = tournament.players?.some((p) => p.username === user?.username);
  const scheduledStart = tournament.scheduled_start_at ? new Date(tournament.scheduled_start_at) : null;
  const scheduledStartPending = scheduledStart && scheduledStart > new Date();
  const formattedScheduledStart = formatScheduledStart(tournament.scheduled_start_at);

  const handleJoin = async () => {
    try { await api.post(`/tournaments/${id}/join/`); load(); } catch (e) { setError(e.response?.data?.error || "Error"); }
  };
  const handleStart = async () => {
    try { await api.post(`/tournaments/${id}/start/`); navigate(`/tournament/${id}/play`); } catch (e) { setError(e.response?.data?.error || "Error"); }
  };
  const handleResume = async () => {
    try { await api.post(`/tournaments/${id}/resume/`); navigate(`/tournament/${id}/play`); } catch (e) { setError(e.response?.data?.error || "Error"); }
  };

  const playableLevels = tournament.levels.filter((level) => !level.is_break).length;

  const finished = tournament.status === "finished";
  const ranked = [...tournament.players]
    .filter((p) => p.finish_position)
    .sort((a, b) => a.finish_position - b.finish_position);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header carries the actions, so they're reachable without scrolling */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-(--color-silver)">{tournament.name}</h1>
          <p className="text-(--color-text-muted) mt-1">
            Host: {tournament.host_name} &middot; {tournament.starting_chips.toLocaleString()} chips &middot;{" "}
            <span className="text-[#d9c07a]">{tournament.status}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <TournamentActions
            tournament={tournament} joined={joined} isHost={isHost}
            scheduledStartPending={scheduledStartPending} id={id} navigate={navigate}
            handleJoin={handleJoin} handleStart={handleStart} handleResume={handleResume}
          />
        </div>
      </div>

      {error && <p className="text-[#c76b7a] text-sm mb-4">{error}</p>}
      {playableLevels === 0 && (
        <p className="text-sm text-[#c76b7a] mb-4">Tournament needs at least one playable blind level.</p>
      )}

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <main className="flex-1 min-w-0 space-y-6">

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="panel rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-(--color-text-muted) mb-1">Seating</p>
          <p className="text-sm text-(--color-silver)">{tournament.max_players} total players</p>
          <p className="text-sm text-(--color-text-muted)">{tournament.players_per_table} players per table</p>
        </div>
        <div className="panel rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-(--color-text-muted) mb-1">Registration</p>
          <p className="text-sm text-(--color-silver)">
            {tournament.late_reg_level > 0 ? `Late reg through level ${tournament.late_reg_level}` : "Late reg disabled"}
          </p>
          <p className="text-sm text-(--color-text-muted)">
            {tournament.allow_rebuys
              ? `${tournament.max_rebuys} rebuys through level ${tournament.rebuy_level}`
              : "Rebuys disabled"}
          </p>
        </div>
        <div className="panel rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-(--color-text-muted) mb-1">Scheduled Start</p>
          <p className="text-sm text-(--color-silver)">
            {formattedScheduledStart || "Manual host-controlled start"}
          </p>
          {scheduledStartPending && (
            <p className="text-sm text-(--color-silver) mt-1">This tournament starts automatically once the scheduled time arrives and enough players are seated.</p>
          )}
        </div>
        <div className="panel rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-(--color-text-muted) mb-1">Time Bank</p>
          <p className="text-sm text-(--color-silver)">
            {tournament.time_bank_seconds
              ? `${tournament.time_bank_seconds} seconds per player`
              : "Disabled"}
          </p>
          <p className="text-sm text-(--color-text-muted)">{formatTimeBankRefill(tournament)}</p>
        </div>
        <div className="panel rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-(--color-text-muted) mb-1">Prize Pool Reference</p>
          {tournament.payout_structure?.length > 0 && (
            <ul className="mt-3 divide-y divide-[rgba(196,178,165,0.14)] rounded panel-raised text-sm">
              {tournament.payout_structure.map((row) => (
                <li key={row.place} className="flex justify-between px-3 py-2">
                  <span className="text-(--color-silver)">{formatPayoutLabel(row)}</span>
                  <span className="text-[#d9c07a]">{row.percentage}%</span>
                </li>
              ))}
            </ul>
          )}
          {!tournament.payout_structure?.length && (
            <p className="text-sm text-(--color-silver)">No payout structure configured.</p>
          )}
          <p className="text-xs text-(--color-text-muted) mt-2">Reference only — payments happen outside this app.</p>
        </div>
        <div className="panel rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-(--color-text-muted) mb-1">Table Rules</p>
          <p className="text-sm text-(--color-silver)">
            Rabbit hunting {tournament.rabbit_hunting_enabled ? "enabled" : "disabled"}
          </p>
          <p className="text-sm text-(--color-text-muted)">
            {tournament.auto_remove_offline_seconds > 0
              ? `Offline players removed after ${tournament.auto_remove_offline_seconds} seconds`
              : "Offline auto-removal disabled"}
          </p>
        </div>
      </div>

      {finished && ranked.length > 0 && (
        <section>
          <h2 className="font-semibold mb-2 text-(--color-silver)">Final Standings</h2>
          <ol className="panel rounded-lg divide-y divide-[rgba(196,178,165,0.14)]">
            {ranked.map((p) => (
              <li key={p.id} className="px-4 py-2 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span className={`font-mono text-sm w-6 ${p.finish_position === 1 ? "text-[#d9c07a]" : "text-(--color-text-muted)"}`}>
                    {p.finish_position}
                  </span>
                  <span className={p.finish_position === 1 ? "text-[#d9c07a] font-semibold" : "text-(--color-silver)"}>
                    {p.finish_position === 1 && "🏆 "}{p.username}
                  </span>
                </span>
                <span className="text-(--color-text-muted) text-sm">
                  {p.rebuy_count > 0 && `${p.rebuy_count} rebuy${p.rebuy_count === 1 ? "" : "s"}`}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <h2 className="font-semibold mb-2 text-(--color-silver)">
          Players ({tournament.players.length}/{tournament.max_players})
        </h2>
        <ul className="panel rounded-lg divide-y divide-[rgba(196,178,165,0.14)] grid sm:grid-cols-2 sm:divide-y-0">
          {tournament.players.map((p) => (
            <li key={p.id} className="px-4 py-2 flex justify-between gap-2 border-b border-[rgba(196,178,165,0.14)] sm:border-b-0">
              <span className="text-(--color-silver) truncate">{p.username}</span>
              <span className="text-(--color-text-muted) text-sm shrink-0">
                {p.chips?.toLocaleString()} &middot; seat {p.seat}
              </span>
            </li>
          ))}
        </ul>
      </section>

        </main>

        {/* The blind schedule is long, so it gets its own scrollable rail
            rather than pushing everything else down the page. */}
        <aside className="w-full lg:w-80 shrink-0 lg:sticky lg:top-8">
          <h2 className="font-semibold mb-2 text-(--color-silver)">Blind Schedule</h2>
          <ul className="panel rounded-lg divide-y divide-[rgba(196,178,165,0.14)] text-sm max-h-[32rem] overflow-y-auto">
        {tournament.levels.map((level, index) => (
          <li key={level.id} className="px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-(--color-silver)">
                {level.is_break ? `Break ${index + 1}` : `Level ${tournament.levels.slice(0, index + 1).filter((item) => !item.is_break).length}`}
              </p>
              <p className="text-(--color-text-muted)">
                {level.is_break
                  ? "Pause in play"
                  : `SB ${level.small_blind} / BB ${level.big_blind}${level.ante ? ` / Ante ${level.ante}` : ""}`}
              </p>
            </div>
            <span className="text-(--color-text-muted)">
              {level.is_break
                ? `${level.duration_minutes} min`
                : level.duration_minutes != null
                  ? `${level.duration_minutes} min`
                  : `${level.duration_hands} hands`}
            </span>
          </li>
        ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function TournamentActions({
  tournament, joined, isHost, scheduledStartPending, id, navigate,
  handleJoin, handleStart, handleResume,
}) {
  return (
    <>
        {!joined && tournament.status === "lobby" && (
          <button onClick={handleJoin} className="btn-accent px-4 py-2 rounded font-semibold transition-colors">Join</button>
        )}
        {isHost && tournament.status === "lobby" && tournament.players.length >= 2 && (
          <button
            onClick={handleStart}
            disabled={Boolean(scheduledStartPending)}
            className="btn-accent px-4 py-2 rounded font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {scheduledStartPending ? "Scheduled" : "Start Tournament"}
          </button>
        )}
        {isHost && tournament.status === "paused" && (
          <button onClick={handleResume} className="btn-accent px-4 py-2 rounded font-semibold transition-colors">
            Resume Tournament
          </button>
        )}
        {joined && tournament.status === "paused" && (
          <button onClick={() => navigate(`/tournament/${id}/play`)} className="btn-secondary px-4 py-2 rounded font-semibold transition-colors">
            Open Table
          </button>
        )}
        <button onClick={() => navigate("/")} className="btn-secondary px-4 py-2 rounded transition-colors">Back to Lobby</button>
    </>
  );
}
