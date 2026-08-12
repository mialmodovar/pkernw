import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/http";
import useAuthStore from "../store/authStore";

const formatScheduledStart = (value) => {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

const formatTimeBankRefill = (tournament) => {
  if (!tournament.time_bank_seconds) return "No time bank";
  if (tournament.time_bank_refill_rule === "hands") return `Refills every ${tournament.time_bank_refill_every_hands} hands`;
  if (tournament.time_bank_refill_rule === "blind_level") return `Refills at level ${tournament.time_bank_refill_level}`;
  return "No refill";
};

const describeLevel = (level) => {
  if (!level) return "—";
  if (level.is_break) return `Break · ${level.duration_minutes} min`;
  return `${level.small_blind}/${level.big_blind}${level.ante ? ` (${level.ante})` : ""}`;
};

const levelDuration = (level) =>
  level.duration_minutes != null ? `${level.duration_minutes} min` : `${level.duration_hands} hands`;

const STATUS_STYLE = {
  lobby: "bg-amber-900/50 text-amber-200 border-amber-700/40",
  running: "bg-(--color-accent-soft) text-red-200 border-(--color-border-strong)",
  paused: "bg-black/40 text-(--color-silver) border-(--color-border)",
  finished: "bg-black/40 text-(--color-text-muted) border-(--color-border)",
};

/** A headline number in the banner — the things you want before anything else. */
function Headline({ label, value }) {
  return (
    <div className="text-right">
      <p className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">{label}</p>
      <p className="text-lg font-bold text-(--color-silver) leading-tight">{value}</p>
    </div>
  );
}

function Fact({ label, children }) {
  return (
    <div className="flex justify-between gap-3 px-3 py-1.5 text-sm">
      <span className="text-(--color-text-muted)">{label}</span>
      <span className="text-(--color-silver) text-right">{children}</span>
    </div>
  );
}

function Panel({ title, children, className = "" }) {
  return (
    <section className={`panel rounded-lg ${className}`}>
      <h2 className="px-3 py-2 border-b border-(--color-border) text-[11px] font-semibold uppercase tracking-wide text-(--color-silver)">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function TournamentSetupPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [tournament, setTournament] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    const { data } = await api.get(`/tournaments/${id}/`);
    setTournament(data);
    if (data.status === "running") navigate(`/tournament/${id}/play`);
  }, [id, navigate]);

  useEffect(() => { load(); const iv = setInterval(load, 3000); return () => clearInterval(iv); }, [load]);

  const ranked = useMemo(() => {
    const players = tournament?.players || [];
    const alive = players.filter((p) => !p.is_eliminated).sort((a, b) => b.chips - a.chips);
    const out = players.filter((p) => p.is_eliminated)
      .sort((a, b) => (a.finish_position || 999) - (b.finish_position || 999));
    return [...alive, ...out];
  }, [tournament]);

  if (!tournament) return <p className="text-center mt-10 text-(--color-text-muted)">Loading...</p>;

  const isHost = tournament.host_name === user?.username;
  const joined = tournament.players?.some((p) => p.username === user?.username);
  const scheduledStart = tournament.scheduled_start_at ? new Date(tournament.scheduled_start_at) : null;
  const scheduledStartPending = scheduledStart && scheduledStart > new Date();

  const handleJoin = async () => {
    try { await api.post(`/tournaments/${id}/join/`); load(); } catch (e) { setError(e.response?.data?.error || "Error"); }
  };
  const handleStart = async () => {
    try { await api.post(`/tournaments/${id}/start/`); navigate(`/tournament/${id}/play`); } catch (e) { setError(e.response?.data?.error || "Error"); }
  };
  const handleResume = async () => {
    try { await api.post(`/tournaments/${id}/resume/`); navigate(`/tournament/${id}/play`); } catch (e) { setError(e.response?.data?.error || "Error"); }
  };

  const levels = tournament.levels || [];
  const playableLevels = levels.filter((level) => !level.is_break).length;
  const currentLevel = levels[tournament.current_level_index] || null;
  const nextLevel = levels[(tournament.current_level_index ?? 0) + 1] || null;

  const alive = (tournament.players || []).filter((p) => !p.is_eliminated);
  const stacks = alive.map((p) => p.chips);
  const payouts = tournament.payout_structure || [];
  const started = tournament.status !== "lobby";

  const visible = filter
    ? ranked.filter((p) => p.username.toLowerCase().includes(filter.toLowerCase()))
    : ranked;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Banner — name, state and the headline numbers, as a tournament lobby leads */}
      <header className="panel rounded-lg px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-(--color-silver) truncate">{tournament.name}</h1>
            <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border ${STATUS_STYLE[tournament.status]}`}>
              {tournament.status}
            </span>
          </div>
          <p className="text-xs text-(--color-text-muted) mt-0.5">
            Host: {tournament.host_name}
            {scheduledStart && ` · ${scheduledStartPending ? "starts" : "started"} ${formatScheduledStart(tournament.scheduled_start_at)}`}
          </p>
        </div>

        <div className="flex items-center gap-6">
          <Headline label="Entrants" value={`${tournament.players.length}/${tournament.max_players}`} />
          <Headline label="Start stack" value={tournament.starting_chips.toLocaleString()} />
          <Headline label="Places paid" value={payouts.length || "—"} />
        </div>

        <div className="flex flex-wrap gap-2 w-full lg:w-auto">
          <TournamentActions
            tournament={tournament} joined={joined} isHost={isHost}
            scheduledStartPending={scheduledStartPending} id={id} navigate={navigate}
            handleJoin={handleJoin} handleStart={handleStart} handleResume={handleResume}
          />
        </div>
      </header>

      {error && <p className="text-[#c76b7a] text-sm mt-3">{error}</p>}
      {playableLevels === 0 && (
        <p className="text-sm text-[#c76b7a] mt-3">This tournament needs at least one playable blind level.</p>
      )}

      <div className="grid gap-4 mt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* What is happening now */}
        <div className="space-y-4">
          <Panel title="Tournament">
            <div className="divide-y divide-[rgba(196,178,165,0.1)]">
              <Fact label="Players left">{alive.length} of {tournament.players.length}</Fact>
              {started && <Fact label="Current level">{describeLevel(currentLevel)}</Fact>}
              <Fact label={started ? "Next level" : "First level"}>
                {describeLevel(started ? nextLevel : levels[0])}
              </Fact>
              {stacks.length > 0 && (
                <>
                  <Fact label="Largest stack">{Math.max(...stacks).toLocaleString()}</Fact>
                  <Fact label="Average stack">
                    {Math.round(stacks.reduce((sum, c) => sum + c, 0) / stacks.length).toLocaleString()}
                  </Fact>
                  <Fact label="Smallest stack">{Math.min(...stacks).toLocaleString()}</Fact>
                </>
              )}
            </div>
          </Panel>

          <Panel title="Format">
            <div className="divide-y divide-[rgba(196,178,165,0.1)]">
              <Fact label="Seating">{tournament.players_per_table} per table</Fact>
              <Fact label="Late registration">
                {tournament.late_reg_level > 0 ? `Through level ${tournament.late_reg_level}` : "Closed"}
              </Fact>
              <Fact label="Rebuys">
                {tournament.allow_rebuys
                  ? `${tournament.max_rebuys} through level ${tournament.rebuy_level}`
                  : "Not allowed"}
              </Fact>
              <Fact label="Time bank">
                {tournament.time_bank_seconds ? `${tournament.time_bank_seconds}s` : "None"}
              </Fact>
              <Fact label="Refill">{formatTimeBankRefill(tournament)}</Fact>
              <Fact label="Rabbit hunting">{tournament.rabbit_hunting_enabled ? "On" : "Off"}</Fact>
              <Fact label="Offline removal">
                {tournament.auto_remove_offline_seconds > 0 ? `${tournament.auto_remove_offline_seconds}s` : "Off"}
              </Fact>
            </div>
          </Panel>
        </div>

        {/* What it pays */}
        <Panel title={payouts.length ? `Prize pool · ${payouts.length} places paid` : "Prize pool"}
               className="self-start">
          {payouts.length > 0 ? (
            <ul className="divide-y divide-[rgba(196,178,165,0.1)] max-h-[26rem] overflow-y-auto">
              {payouts.map((row) => (
                <li key={row.place} className="flex justify-between px-3 py-1.5 text-sm">
                  <span className="text-(--color-silver)">{row.label || `${row.place}.`}</span>
                  <span className="text-[#d9c07a] font-semibold">{row.percentage}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-sm text-(--color-text-muted)">No payout structure configured.</p>
          )}
          <p className="px-3 py-2 border-t border-(--color-border) text-[11px] text-(--color-text-muted)">
            Percentages only — payments happen outside this app.
          </p>
        </Panel>

        {/* Who is in it */}
        <section className="panel rounded-lg self-start">
          <div className="px-3 py-2 border-b border-(--color-border) flex items-center gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-(--color-silver) flex-1">
              Players
            </h2>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search"
              className="input-field rounded px-2 py-0.5 text-xs w-28"
            />
          </div>
          <div className="max-h-[30rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">
                <tr className="border-b border-(--color-border)">
                  <th className="text-left font-normal px-3 py-1.5 w-10">#</th>
                  <th className="text-left font-normal px-1 py-1.5">Player</th>
                  <th className="text-right font-normal px-3 py-1.5">Chips</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(196,178,165,0.1)]">
                {visible.map((player, index) => {
                  const isMe = player.username === user?.username;
                  // Busted players keep their place in the story, greyed out with
                  // where they finished, as a lobby ladder does.
                  const out = player.is_eliminated;
                  return (
                    <tr key={player.id} className={isMe ? "bg-(--color-accent-soft)" : ""}>
                      <td className={`px-3 py-1.5 font-mono ${out ? "text-(--color-text-muted)" : "text-(--color-silver)"}`}>
                        {out ? (player.finish_position ?? "—") : (filter ? "" : index + 1)}
                      </td>
                      <td className={`px-1 py-1.5 truncate ${out ? "text-(--color-text-muted) line-through" : "text-(--color-silver)"}`}>
                        {player.username}{isMe && " (you)"}
                        {player.rebuy_count > 0 && (
                          <span className="text-[10px] text-(--color-text-muted)"> · {player.rebuy_count}R</span>
                        )}
                      </td>
                      <td className={`px-3 py-1.5 text-right font-mono ${out ? "text-(--color-text-muted)" : "text-[#d9c07a]"}`}>
                        {out ? "out" : player.chips.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr><td colSpan={3} className="px-3 py-3 text-(--color-text-muted)">No players match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* The whole structure, as a table rather than a long list */}
      <Panel title="Blind structure" className="mt-4">
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">
              <tr className="border-b border-(--color-border)">
                <th className="text-left font-normal px-3 py-1.5 w-24">Level</th>
                <th className="text-left font-normal px-3 py-1.5">Blinds</th>
                <th className="text-left font-normal px-3 py-1.5">Ante</th>
                <th className="text-right font-normal px-3 py-1.5">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(196,178,165,0.1)]">
              {levels.map((level, index) => {
                const isNow = started && index === tournament.current_level_index;
                const number = levels.slice(0, index + 1).filter((item) => !item.is_break).length;
                return (
                  <tr key={level.id} className={isNow ? "bg-(--color-accent-soft)" : ""}>
                    <td className="px-3 py-1.5 text-(--color-silver)">
                      {level.is_break ? "Break" : `Level ${number}`}
                      {isNow && <span className="text-[10px] text-[#d9c07a]"> · now</span>}
                    </td>
                    <td className="px-3 py-1.5 text-(--color-silver)">
                      {level.is_break ? <span className="text-(--color-text-muted)">Pause in play</span>
                        : `${level.small_blind} / ${level.big_blind}`}
                    </td>
                    <td className="px-3 py-1.5 text-(--color-text-muted)">{level.ante || "—"}</td>
                    <td className="px-3 py-1.5 text-right text-(--color-text-muted)">{levelDuration(level)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
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
        <button onClick={handleJoin} className="btn-accent px-4 py-2 rounded font-semibold text-sm transition-colors">Join</button>
      )}
      {isHost && tournament.status === "lobby" && tournament.players.length >= 2 && (
        <button
          onClick={handleStart}
          disabled={Boolean(scheduledStartPending)}
          className="btn-accent px-4 py-2 rounded font-semibold text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {scheduledStartPending ? "Scheduled" : "Start Tournament"}
        </button>
      )}
      {isHost && tournament.status === "paused" && (
        <button onClick={handleResume} className="btn-accent px-4 py-2 rounded font-semibold text-sm transition-colors">
          Resume
        </button>
      )}
      {joined && tournament.status === "paused" && (
        <button onClick={() => navigate(`/tournament/${id}/play`)} className="btn-secondary px-4 py-2 rounded font-semibold text-sm transition-colors">
          Open Table
        </button>
      )}
      <button onClick={() => navigate("/")} className="btn-secondary px-4 py-2 rounded text-sm transition-colors">
        Back to Lobby
      </button>
    </>
  );
}
