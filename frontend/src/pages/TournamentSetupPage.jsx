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

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-2 text-(--color-silver)">{tournament.name}</h1>
      <p className="text-(--color-text-muted) mb-6">
        Host: {tournament.host_name} &middot; {tournament.starting_chips.toLocaleString()} chips &middot;{" "}
        <span className="text-[#d9c07a]">{tournament.status}</span>
      </p>

      <div className="grid gap-3 sm:grid-cols-2 mb-6">
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
        <div className="panel rounded-lg p-4 sm:col-span-2">
          <p className="text-xs uppercase tracking-wide text-(--color-text-muted) mb-1">Scheduled Start</p>
          <p className="text-sm text-(--color-silver)">
            {formattedScheduledStart || "Manual host-controlled start"}
          </p>
          {scheduledStartPending && (
            <p className="text-sm text-(--color-silver) mt-1">This tournament starts automatically once the scheduled time arrives and enough players are seated.</p>
          )}
        </div>
        <div className="panel rounded-lg p-4 sm:col-span-2">
          <p className="text-xs uppercase tracking-wide text-(--color-text-muted) mb-1">Time Bank</p>
          <p className="text-sm text-(--color-silver)">
            {tournament.time_bank_seconds
              ? `${tournament.time_bank_seconds} seconds per player`
              : "Disabled"}
          </p>
          <p className="text-sm text-(--color-text-muted)">{formatTimeBankRefill(tournament)}</p>
        </div>
        <div className="panel rounded-lg p-4 sm:col-span-2">
          <p className="text-xs uppercase tracking-wide text-(--color-text-muted) mb-1">Prize Pool Reference</p>
          <p className="text-xs text-(--color-text-muted) mt-1">Reference only. Payments are handled outside this app.</p>
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
            <p className="text-sm text-(--color-text-muted) mt-2">No payout structure configured.</p>
          )}
        </div>
        <div className="panel rounded-lg p-4 sm:col-span-2">
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

      <h2 className="font-semibold mb-2 text-(--color-silver)">Players ({tournament.players.length}/{tournament.max_players})</h2>
      <ul className="panel rounded-lg divide-y divide-[rgba(196,178,165,0.14)] mb-6">
        {tournament.players.map((p) => (
          <li key={p.id} className="px-4 py-2 flex justify-between">
            <span>{p.username}</span>
            <span className="text-(--color-text-muted)">
              Seat {p.seat}
              {tournament.time_bank_seconds > 0 && ` | Bank ${p.time_bank_seconds_remaining}s`}
            </span>
          </li>
        ))}
      </ul>

      <h2 className="font-semibold mb-2 text-(--color-silver)">Blind Schedule</h2>
      <ul className="panel rounded-lg divide-y divide-[rgba(196,178,165,0.14)] mb-6 text-sm">
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

      {playableLevels === 0 && <p className="text-sm text-[#c76b7a] mb-4">Tournament needs at least one playable blind level.</p>}

      {error && <p className="text-[#c76b7a] text-sm mb-3">{error}</p>}

      <div className="flex gap-3">
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
        <button onClick={() => navigate("/")} className="btn-secondary px-4 py-2 rounded transition-colors">Back</button>
      </div>
    </div>
  );
}
