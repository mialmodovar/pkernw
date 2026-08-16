import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/** One running table, drawn as the felt it is so that clicking it to watch
 *  needs no explaining. Seats sit on the ring in their real order, which is
 *  what makes two tables tell themselves apart at a glance. */
function WatchableTable({ table, players, onWatch }) {
  const seats = Array.from(
    { length: table.max_seats || players.length || 1 },
    (_, index) => players.find((player) => player.seat_at_table === index) || null,
  );
  const chips = players.reduce((sum, player) => sum + player.chips, 0);

  return (
    <button
      type="button"
      onClick={onWatch}
      className="group text-left rounded-lg border border-(--color-border) bg-black/20 p-3
                 transition-colors hover:border-(--color-highlight-edge) hover:bg-black/30
                 focus:outline-none focus-visible:border-(--color-highlight-edge)"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-(--color-silver)">Table {table.table_number}</span>
        <span className="text-[10px] uppercase tracking-wide text-(--color-text-muted) group-hover:text-(--color-highlight-text)">
          Watch
        </span>
      </div>

      <div className="relative mt-2 aspect-[16/9]">
        <div className="felt absolute inset-x-[14%] inset-y-[22%] rounded-[50%]" />
        {seats.map((player, index) => {
          // Seat 0 at the bottom, then round the ring — the same order the
          // table itself deals in.
          const angle = (index / seats.length) * 2 * Math.PI + Math.PI / 2;
          return (
            <span
              key={index}
              title={player ? `${player.display_name || player.username} · ${player.chips.toLocaleString()}` : "Empty seat"}
              style={{
                left: `${50 + 43 * Math.cos(angle)}%`,
                top: `${50 + 39 * Math.sin(angle)}%`,
                transform: "translate(-50%, -50%)",
              }}
              className={`absolute grid h-6 w-6 place-items-center rounded-full border text-[10px] font-bold uppercase ${
                player
                  ? "border-(--color-border-strong) bg-black/70 text-(--color-silver)"
                  : "border-dashed border-(--color-border) bg-black/30 text-(--color-text-muted)"
              }`}
            >
              {player ? (player.display_name || player.username).slice(0, 2) : ""}
            </span>
          );
        })}
      </div>

      <p className="mt-1 text-[11px] text-(--color-text-muted) truncate">
        {players.length
          ? `${players.length}/${seats.length} seats · ${chips.toLocaleString()} chips`
          : "No players seated"}
      </p>
      <p className="text-[11px] text-(--color-silver) truncate">
        {players.map((player) => player.display_name || player.username).join(", ") || "—"}
      </p>
    </button>
  );
}

export default function TournamentSetupPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [tournament, setTournament] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const lastStatus = useRef(null);

  const load = useCallback(async () => {
    const { data } = await api.get(`/tournaments/${id}/`);
    setTournament(data);
    // Straight to your seat when it starts under you, and only then. Arriving
    // at a tournament that is already running means you came here on purpose —
    // sending you back to the table on every poll made this page unreachable
    // for anyone still in it.
    const startedJustNow = lastStatus.current === "lobby" && data.status === "running";
    lastStatus.current = data.status;
    const mine = data.players?.find((p) => p.username === user?.username);
    if (startedJustNow && mine && !mine.is_eliminated) navigate(`/tournament/${id}/play`);
  }, [id, navigate, user?.username]);

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
  const me = tournament.players?.find((p) => p.username === user?.username) || null;
  const joined = Boolean(me);
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
  // Only a tournament in play has anything to watch, and only tables that are
  // still dealing: a broken one keeps its row in the DB with nobody on it.
  const liveTables = (tournament.status === "running" || tournament.status === "paused")
    ? (tournament.tables || []).filter((table) => table.is_active)
    : [];
  const buyInCents = tournament.buy_in_cents || 0;
  // The column only exists once there is money to show, so a friendly game
  // never grows an empty euro column.
  const anyPrizes = tournament.players.some((player) => player.prize_cents > 0);
  // What the pot would be if everyone registered turns up — rebuys grow it further.
  const potCents = buyInCents * tournament.players.length;

  const visible = filter
    ? ranked.filter((p) => `${p.display_name || ""} ${p.username}`.toLowerCase()
        .includes(filter.toLowerCase()))
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
            Host: {tournament.host_display_name || tournament.host_name}
            {scheduledStart && ` · ${scheduledStartPending ? "starts" : "started"} ${formatScheduledStart(tournament.scheduled_start_at)}`}
          </p>
        </div>

        <div className="flex items-center gap-6">
          <Headline label="Entrants" value={`${tournament.players.length}/${tournament.max_players}`} />
          <Headline label="Start stack" value={tournament.starting_chips.toLocaleString()} />
          {buyInCents > 0 && <Headline label="Buy-in" value={`${(buyInCents / 100).toFixed(2)}€`} />}
          <Headline label="Places paid" value={payouts.length || "—"} />
        </div>

        <div className="flex flex-wrap gap-2 w-full lg:w-auto">
          <TournamentActions
            tournament={tournament} joined={joined} me={me} isHost={isHost}
            scheduledStartPending={scheduledStartPending} id={id} navigate={navigate}
            handleJoin={handleJoin} handleStart={handleStart} handleResume={handleResume}
          />
        </div>
      </header>

      {error && <p className="text-[#c76b7a] text-sm mt-3">{error}</p>}
      {playableLevels === 0 && (
        <p className="text-sm text-[#c76b7a] mt-3">This tournament needs at least one playable blind level.</p>
      )}

      <div className="grid gap-4 mt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        {/* The reference column: what this tournament is, what it pays, and the
            structure it runs on. All of it worth a look, none of it worth the
            width of the page. */}
        <div className="space-y-4 min-w-0">
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

          {/* What it pays */}
          <Panel title={payouts.length ? `Prize pool · ${payouts.length} places paid` : "Prize pool"}>
          {payouts.length > 0 ? (
            <ul className="divide-y divide-[rgba(196,178,165,0.1)] max-h-[26rem] overflow-y-auto">
              {payouts.map((row) => (
                <li key={row.place} className="flex justify-between px-3 py-1.5 text-sm">
                  <span className="text-(--color-silver)">{row.label || `${row.place}.`}</span>
                  <span className="text-[#d9c07a] font-semibold">
                    {row.percentage}%
                    {potCents > 0 && (
                      <span className="text-(--color-text-muted) font-normal ml-2">
                        {(potCents * row.percentage / 10000).toFixed(2)}€
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-sm text-(--color-text-muted)">No payout structure configured.</p>
          )}
          <p className="px-3 py-2 border-t border-(--color-border) text-[11px] text-(--color-text-muted)">
            {potCents > 0
              ? `Prize pool ${(potCents / 100).toFixed(2)}€ so far · settle up in Calotes, payments happen outside this app.`
              : "Percentages only — payments happen outside this app."}
          </p>
          </Panel>

          {/* Ante rides with the blinds rather than taking a column of its own:
              this is a sidebar now, not the full width of the page. */}
          <Panel title="Blind structure">
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">
                  <tr className="border-b border-(--color-border)">
                    <th className="text-left font-normal px-3 py-1.5 w-20">Level</th>
                    <th className="text-left font-normal px-1 py-1.5">Blinds</th>
                    <th className="text-right font-normal px-3 py-1.5">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(196,178,165,0.1)]">
                  {levels.map((level, index) => {
                    const isNow = started && index === tournament.current_level_index;
                    const number = levels.slice(0, index + 1).filter((item) => !item.is_break).length;
                    return (
                      <tr key={level.id} className={isNow ? "bg-(--color-accent-soft)" : ""}>
                        <td className="px-3 py-1.5 text-(--color-silver) whitespace-nowrap">
                          {level.is_break ? "Break" : number}
                          {isNow && <span className="text-[10px] text-[#d9c07a]"> · now</span>}
                        </td>
                        <td className="px-1 py-1.5 text-(--color-silver)">
                          {level.is_break ? <span className="text-(--color-text-muted)">Pause in play</span>
                            : `${level.small_blind} / ${level.big_blind}`}
                          {!level.is_break && level.ante > 0 && (
                            <span className="text-(--color-text-muted)"> · {level.ante} ante</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right text-(--color-text-muted) whitespace-nowrap">
                          {levelDuration(level)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        {/* The felt, and who is on it */}
        <div className="space-y-4 min-w-0">
          {liveTables.length > 0 && (
            <Panel title="Tables · pick one to watch">
              <div className="grid gap-3 p-3 sm:grid-cols-2">
                {liveTables.map((table) => (
                  <WatchableTable
                    key={table.id}
                    table={table}
                    players={alive
                      .filter((player) => player.table_number === table.table_number)
                      .sort((a, b) => a.seat_at_table - b.seat_at_table)}
                    onWatch={() => navigate(`/tournament/${id}/watch/${table.table_number}`)}
                  />
                ))}
              </div>
            </Panel>
          )}

          <section className="panel rounded-lg">
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
                  {anyPrizes && <th className="text-right font-normal px-3 py-1.5">Won</th>}
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
                        {player.display_name || player.username}{isMe && " (you)"}
                        {player.rebuy_count > 0 && (
                          <span className="text-[10px] text-(--color-text-muted)"> · {player.rebuy_count}R</span>
                        )}
                      </td>
                      {anyPrizes && (
                        <td className="px-3 py-1.5 text-right font-mono text-emerald-400">
                          {player.prize_cents > 0 ? `${(player.prize_cents / 100).toFixed(2)}€` : ""}
                        </td>
                      )}
                      <td className={`px-3 py-1.5 text-right font-mono ${out ? "text-(--color-text-muted)" : "text-[#d9c07a]"}`}>
                        {out ? "out" : player.chips.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr><td colSpan={anyPrizes ? 4 : 3} className="px-3 py-3 text-(--color-text-muted)">No players match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function TournamentActions({
  tournament, joined, me, isHost, scheduledStartPending, id, navigate,
  handleJoin, handleStart, handleResume,
}) {
  const seatedInPlay = me && !me.is_eliminated
    && (tournament.status === "running" || tournament.status === "paused");
  return (
    <>
      {seatedInPlay && (
        <button
          onClick={() => navigate(`/tournament/${id}/play`)}
          className="btn-accent px-4 py-2 rounded font-semibold text-sm transition-colors"
        >
          Back to your table
        </button>
      )}
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
      <button onClick={() => navigate("/")} className="btn-secondary px-4 py-2 rounded text-sm transition-colors">
        Back to Lobby
      </button>
    </>
  );
}
