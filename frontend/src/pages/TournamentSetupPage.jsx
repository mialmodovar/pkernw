import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import api from "../api/http";
import Avatar from "../components/Avatar";
import useAuthStore from "../store/authStore";
import { claimEntryRedirect } from "../components/lobby/autoOpenTable";
import { entryCount, payoutLabel, placingPoolCents, totalPool } from "../components/game/prizePool";
import { formatEuros } from "../components/game/formatMoney";
import { buyInLabel, formatCoins, isSpinGo } from "../components/lobby/buyIn";
import { rebuyLabel, rebuyOffer } from "../components/lobby/rebuyOffer";
import ShareTournamentButton from "../components/lobby/ShareTournamentButton";
import { tournamentVitals, vitalsSummary } from "../components/lobby/tournamentVitals";
import { useCountdown } from "../components/lobby/useCountdown";

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
function Headline({ label, value, tone = "text-(--color-silver)", title }) {
  return (
    <div className="text-right" title={title}>
      <p className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">{label}</p>
      <p className={`text-lg font-bold leading-tight ${tone}`}>{value}</p>
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

/** The table you picked from the list, drawn as the felt it is. Seats sit on
 *  the ring in their real order, which is what tells two tables apart. */
function TableCard({ table, players, onWatch }) {
  const seats = Array.from(
    { length: table.max_seats || players.length || 1 },
    (_, index) => players.find((player) => player.seat_at_table === index) || null,
  );
  const chips = players.reduce((sum, player) => sum + player.chips, 0);

  return (
    <div className="rounded-lg border border-(--color-border) bg-black/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-(--color-silver)">Table {table.table_number}</span>
        <button
          type="button"
          onClick={onWatch}
          className="btn-accent px-3 py-1 rounded text-xs font-semibold transition-colors"
        >
          Watch
        </button>
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
              {player ? (
                <Avatar
                  url={player.avatar_url}
                  emoji={player.avatar_emoji}
                  name={player.username}
                  className="w-full h-full rounded-full"
                  emojiClassName="text-[11px]"
                />
              ) : ""}
            </span>
          );
        })}
      </div>

      <p className="mt-1 text-[11px] text-(--color-text-muted)">
        {players.length
          ? `${players.length}/${seats.length} seats · ${chips.toLocaleString()} chips`
          : "No players seated"}
      </p>
      <p className="text-[11px] text-(--color-silver) truncate">
        {players.map((player) => player.display_name || player.username).join(", ") || "—"}
      </p>
    </div>
  );
}

export default function TournamentSetupPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [tournament, setTournament] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [pickedTable, setPickedTable] = useState(null);
  const lastStatus = useRef(null);
  // Ticks between the three-second polls, so the deadline moves like a clock.
  const lateRegSeconds = useCountdown(tournament?.late_registration_seconds_left ?? null);

  const load = useCallback(async () => {
    const { data } = await api.get(`/tournaments/${id}/`);
    setTournament(data);
    // Straight to your seat when it starts under you — and when the app opened
    // on this page with the tournament already running, which is what a link
    // from the host in the middle of the night is. Not on every poll, though:
    // walking in on a running tournament from inside the app means you came
    // here on purpose, and bouncing you off made the page unreachable for
    // anyone still in it.
    const startedJustNow = lastStatus.current === "lobby" && data.status === "running";
    const firstLook = lastStatus.current === null;
    lastStatus.current = data.status;
    const mine = data.players?.find((p) => p.username === user?.username);
    if (!mine || mine.is_eliminated) return;
    if (startedJustNow) navigate(`/tournament/${id}/play`);
    else if (firstLook && data.status === "running" && claimEntryRedirect()) {
      navigate(`/tournament/${id}/play`, { replace: true });
    }
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

  // Whose night it is and who may run it are two different questions, and only
  // the second decides what buttons to draw. The server answers it — host, club
  // organiser, or the superuser — so this page never offers one the endpoint
  // would refuse.
  const canManage = Boolean(tournament.can_manage);
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
  // Buying back in puts you in a hand's time, so it goes where the hand is
  // rather than leaving you on the page you bought it from.
  const handleRebuy = async () => {
    setError("");
    try { await api.post(`/tournaments/${id}/rebuy/`); navigate(`/tournament/${id}/play`); }
    catch (e) { setError(e.response?.data?.error || "Rebuy failed"); load(); }
  };

  const levels = tournament.levels || [];
  const playableLevels = levels.filter((level) => !level.is_break).length;
  const currentLevel = levels[tournament.current_level_index] || null;
  const nextLevel = levels[(tournament.current_level_index ?? 0) + 1] || null;

  // A finished tournament has a winner, not a field — its banner keeps the
  // entrant count it started with.
  const inPlay = tournament.status === "running" || tournament.status === "paused";
  const vitalsRows = vitalsSummary({ ...tournamentVitals(tournament), lateRegSeconds });
  const alive = (tournament.players || []).filter((p) => !p.is_eliminated);
  const stacks = alive.map((p) => p.chips);
  const payouts = tournament.payout_structure || [];
  const started = tournament.status !== "lobby";
  // Only a tournament in play has anything to watch, and only tables that are
  // still dealing: a broken one keeps its row in the DB with nobody on it.
  const liveTables = (tournament.status === "running" || tournament.status === "paused")
    ? (tournament.tables || []).filter((table) => table.is_active)
    : [];
  const seatedAt = (tableNumber) => alive
    .filter((player) => player.table_number === tableNumber)
    .sort((a, b) => a.seat_at_table - b.seat_at_table);
  // A table that breaks under you falls back to the first one still dealing.
  const shownTable = liveTables.find((table) => table.table_number === pickedTable) || liveTables[0];
  const buyInCents = tournament.buy_in_cents || 0;
  // The column only exists once there is money to show, so a friendly game
  // never grows an empty euro column.
  const anyPrizes = tournament.players.some((player) => player.prize_cents > 0);
  // Entries, not entrants: every rebuy is another buy-in in the pot. The same
  // count the settlement ledger makes, and the same helper the table uses — this
  // page used to multiply the buy-in by the number of names and call it the
  // pot, which in a knockout tournament counted the bounties in twice over and
  // promised a first prize nobody was going to be paid.
  const entries = entryCount(tournament);
  const potCents = placingPoolCents(tournament, entries);
  const bountyOn = (tournament.bounty_mode || "none") !== "none" && (tournament.bounty_cents || 0) > 0;
  const koPoolCents = bountyOn ? (tournament.bounty_cents || 0) * entries : 0;
  // The other currency. A coin tournament is charged and paid for real, so the
  // pool is not a note of what to settle later — it is the coins that will land
  // in a wallet, and a Spin n Go's is the draw rather than the entries.
  const buyInCoins = tournament.buy_in_coins || 0;
  const spinGo = isSpinGo(tournament);
  const potCoins = spinGo
    ? buyInCoins * (tournament.spin_multiplier || 0)
    : buyInCoins * entries;
  // Both of the above added back together, which is the figure the banner
  // leads with: what this tournament is worth, before it is split any way at
  // all. A Spin n Go already has its own headline, drawn rather than paid in.
  const pool = totalPool(tournament, entries);
  // Settled, the ledger's split of the prize; before that, what they have
  // actually taken off other people's heads.
  const koWinnings = (player) => (player.bounty_prize_cents || player.bounty_won_cents || 0);
  const anyKnockouts = bountyOn
    && tournament.players.some((player) => koWinnings(player) > 0 || player.knockouts > 0);

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

        {/* How the tournament is going, beside the state it is in. Before this
            the banner led with the entrant count and the start stack — both
            fixed at the moment it began — while how many were left, what an
            average stack had grown to and how long was left to register were
            somewhere further down the page or nowhere at all. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {inPlay
            ? vitalsRows.map((row) => (
              <Headline
                key={row.key}
                label={row.label}
                value={row.value}
                tone={row.key === "latereg" ? "text-(--color-highlight-text)" : undefined}
              />
            ))
            : (
              <>
                <Headline label="Entrants" value={`${tournament.players.length}/${tournament.max_players}`} />
                <Headline label="Places paid" value={payouts.length || "—"} />
              </>
            )}
          <Headline label="Start stack" value={tournament.starting_chips.toLocaleString()} />
          {buyInCoins > 0 && (
            <Headline
              label="Buy-in"
              value={buyInLabel(tournament)}
              title="Coins, taken from your wallet when you sit down and paid back out to the places"
            />
          )}
          {spinGo && (
            <Headline
              label="Prize"
              value={tournament.spin_multiplier
                ? `${formatCoins(potCoins)} · ${tournament.spin_multiplier}×`
                : "drawn at 3"}
            />
          )}
          {/* What is being played for, as one figure, beside what it costs to
              join it. Until now the lobby had the buy-in and the split and left
              the reader to multiply — and on a knockout night, to add. */}
          {pool && !spinGo && (
            <Headline
              label="Prize pool"
              value={pool.kind === "coins"
                ? `${pool.amount.toLocaleString()} coins`
                : formatEuros(pool.amount)}
              tone="text-(--color-highlight-text)"
              title={bountyOn
                ? `Everything paid in over ${entries} ${entries === 1 ? "entry" : "entries"}: `
                  + `${formatEuros(placingPoolCents(tournament, entries))} to the places, `
                  + `${formatEuros(koPoolCents)} on heads`
                : `Everything paid in over ${entries} ${entries === 1 ? "entry" : "entries"}`}
            />
          )}
          {buyInCents > 0 && (
            <Headline
              label="Buy-in"
              value={formatEuros(buyInCents)}
              // In a knockout game half of it may never reach the places, and
              // the number on its own does not say so.
              title={bountyOn
                ? `${formatEuros(buyInCents - tournament.bounty_cents)} to the places, `
                  + `${formatEuros(tournament.bounty_cents)} onto your head`
                : undefined}
            />
          )}
        </div>

        <div className="flex flex-wrap gap-2 w-full lg:w-auto">
          <TournamentActions
            tournament={tournament} joined={joined} me={me} canManage={canManage}
            scheduledStartPending={scheduledStartPending} id={id} navigate={navigate}
            handleJoin={handleJoin} handleStart={handleStart} handleResume={handleResume}
            handleRebuy={handleRebuy}
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
              {tournament.club_name && (
                <Fact label="Club">
                  {/* The page a player would go looking for after seeing this
                      night belongs to somebody. */}
                  <Link to={`/clubs/${tournament.club_slug}`} className="link-accent">
                    {tournament.club_emoji} {tournament.club_name}
                  </Link>
                  {tournament.league_name
                    ? ` · counts for ${tournament.league_name}`
                    : " · does not count for a league"}
                </Fact>
              )}
              <Fact label="Seating">{tournament.players_per_table} per table</Fact>
              <Fact label="Late registration">
                {tournament.late_reg_level > 0 ? `Through level ${tournament.late_reg_level}` : "Closed"}
              </Fact>
              <Fact label="Rebuys">
                {tournament.allow_rebuys
                  ? `${tournament.max_rebuys ?? "Unlimited"} through level ${tournament.rebuy_level}`
                    // "Through level 4" is the rule; whether you can still act
                    // on it is the thing somebody sitting out wants to know.
                    + (inPlay ? (tournament.rebuys_open ? " · open now" : " · closed") : "")
                  : "Not allowed"}
              </Fact>
              {/* The lobby knew about rebuys, late reg and the time bank and
                  said nothing about the half of the buy-in riding on people's
                  heads — on the one page a knocked-out player can still read. */}
              <Fact label="Knockouts">
                {!bountyOn
                  ? "No bounties"
                  : tournament.bounty_mode === "mystery"
                  // A mystery game puts nothing on anybody's head, so saying it
                  // does — as this line used to for every mode — would be
                  // describing a different tournament.
                  ? `Mystery · ${formatEuros(tournament.bounty_cents)} of each buy-in into a sealed `
                    + `pool of ${formatEuros(koPoolCents)} · envelopes open `
                    + (tournament.mystery_release === "reg_closed"
                      ? "when registration closes"
                      : "at the money")
                  : `${tournament.bounty_mode === "progressive" ? "Progressive" : "Fixed"} · `
                    + `${formatEuros(tournament.bounty_cents)} of each buy-in onto your head`
                    + (tournament.bounty_mode === "progressive"
                      ? ` · ${tournament.bounty_progressive_split_pct}% of a bounty is cash, the rest onto yours`
                      : "")}
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

          {/* Nothing configured means nothing to pay out, and an empty card
              only takes up the column. */}
          {payouts.length > 0 && (
            <Panel title={`${bountyOn ? "Places" : "Prize pool"} · ${payouts.length} places paid`}>
              <ul className="divide-y divide-[rgba(196,178,165,0.1)] max-h-[26rem] overflow-y-auto">
                {payouts.map((row) => (
                  <li key={row.place} className="flex justify-between px-3 py-1.5 text-sm">
                    <span className="text-(--color-silver)">{row.label || `${row.place}.`}</span>
                    <span className="text-[#d9c07a] font-semibold">
                      {row.percentage}%
                      {(potCents > 0 || potCoins > 0) && (
                        <span className="text-(--color-text-muted) font-normal ml-2">
                          {payoutLabel(tournament, row, entries)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="px-3 py-2 border-t border-(--color-border) text-[11px] text-(--color-text-muted)">
                {potCoins > 0
                  ? (spinGo
                    ? `${formatCoins(potCoins)} to the winner — ${formatCoins(buyInCoins)} a seat, `
                      + `multiplied by ${tournament.spin_multiplier}×. Paid into wallets when it ends.`
                    : `${formatCoins(potCoins)} in coins so far · `
                      + `${entries} ${entries === 1 ? "entry" : "entries"} at ${formatCoins(buyInCoins)}. `
                      + "Paid into wallets when it ends.")
                  : potCents > 0
                  ? (bountyOn
                    // Two pools, said as two, because the percentages above only
                    // ever divide the first one. A single "prize pool" figure
                    // with the bounties folded into it is the number this page
                    // used to print, and it was never what anybody got paid.
                    ? `Places ${formatEuros(potCents)} · `
                      + `${tournament.bounty_mode === "mystery" ? "Mystery pool" : "KO pool"} `
                      + `${formatEuros(koPoolCents)} · `
                      + `${entries} ${entries === 1 ? "entry" : "entries"} at ${formatEuros(buyInCents)}, `
                      + `${formatEuros(tournament.bounty_cents)} of each onto a head. `
                      + "Settle up in Calotes, payments happen outside this app."
                    : `Prize pool ${formatEuros(potCents)} so far · settle up in Calotes, payments happen outside this app.`)
                  : buyInCoins > 0
                  ? `Percentages only until somebody sits down. ${formatCoins(buyInCoins)} a seat.`
                  : "Percentages only — payments happen outside this app."}
              </p>
            </Panel>
          )}

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
            <Panel title="Tables">
              <ul className="divide-y divide-[rgba(196,178,165,0.1)] border-b border-(--color-border)">
                {liveTables.map((table) => {
                  const seated = seatedAt(table.table_number);
                  const picked = table.table_number === shownTable.table_number;
                  return (
                    <li key={table.id}>
                      <button
                        type="button"
                        onClick={() => setPickedTable(table.table_number)}
                        className={`w-full flex items-baseline justify-between gap-3 px-3 py-1.5 text-sm transition-colors ${
                          picked
                            ? "bg-(--color-accent-soft) text-(--color-silver)"
                            : "text-(--color-text-muted) hover:bg-white/5"
                        }`}
                      >
                        <span className="font-semibold">Table {table.table_number}</span>
                        <span className="text-xs">{seated.length}/{table.max_seats} seated</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="p-3">
                <TableCard
                  table={shownTable}
                  players={seatedAt(shownTable.table_number)}
                  onWatch={() => navigate(`/tournament/${id}/watch/${shownTable.table_number}`)}
                />
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
                  {anyKnockouts && <th className="text-right font-normal px-3 py-1.5">KO</th>}
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
                        <Avatar
                          url={player.avatar_url}
                          emoji={player.avatar_emoji}
                          name={player.username}
                          // Dimmed with the rest of a busted row rather than
                          // left bright over a struck-through name.
                          className={`inline-flex align-[-0.3em] w-5 h-5 mr-1.5 rounded-full shrink-0
                                      border border-(--color-border) ${out ? "opacity-50 grayscale" : ""}`}
                          emojiClassName="text-xs"
                        />
                        {player.display_name || player.username}{isMe && " (you)"}
                        {player.rebuy_count > 0 && (
                          <span className="text-[10px] text-(--color-text-muted)"> · {player.rebuy_count}R</span>
                        )}
                      </td>
                      {/* What they have taken off other people, and — while
                          they are still in — what sits on their own head for
                          somebody to come and take. In a progressive game that
                          second number is the whole point of the format, and
                          this page never showed it. */}
                      {anyKnockouts && (
                        <td className="px-3 py-1.5 text-right font-mono text-[#d9c07a] whitespace-nowrap"
                          title={out
                            ? `${player.knockouts || 0} knockouts`
                            : `${player.knockouts || 0} knockouts · worth `
                              + `${formatEuros(player.bounty_cents || 0)} to whoever busts them`}>
                          {koWinnings(player) > 0 || player.knockouts > 0
                            ? `${player.knockouts || 0} · ${formatEuros(koWinnings(player))}`
                            : ""}
                          {!out && (player.bounty_cents || 0) > 0 && (
                            <span className="text-[10px] text-(--color-text-muted)">
                              {` (${formatEuros(player.bounty_cents)})`}
                            </span>
                          )}
                        </td>
                      )}
                      {anyPrizes && (
                        <td className="px-3 py-1.5 text-right font-mono text-emerald-400">
                          {player.prize_cents > 0 ? formatEuros(player.prize_cents) : ""}
                        </td>
                      )}
                      <td className={`px-3 py-1.5 text-right font-mono ${out ? "text-(--color-text-muted)" : "text-[#d9c07a]"}`}>
                        {out ? "out" : player.chips.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr><td colSpan={3 + (anyPrizes ? 1 : 0) + (anyKnockouts ? 1 : 0)} className="px-3 py-3 text-(--color-text-muted)">No players match.</td></tr>
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
  tournament, joined, me, canManage, scheduledStartPending, id, navigate,
  handleJoin, handleStart, handleResume, handleRebuy,
}) {
  const seatedInPlay = me && !me.is_eliminated
    && (tournament.status === "running" || tournament.status === "paused");
  // Out, but the tournament is still selling seats to people who are out. This
  // was the only page such a player could reach, and it had nothing for them.
  const offer = rebuyOffer(tournament, {
    eliminated: Boolean(me?.is_eliminated),
    rebuysUsed: me?.rebuy_count ?? 0,
  });
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
      {offer && (
        <button
          onClick={handleRebuy}
          title="Buy back in and take a seat again"
          className="btn-accent px-4 py-2 rounded font-semibold text-sm transition-colors"
        >
          {rebuyLabel(offer)}
        </button>
      )}
      {!joined && tournament.status === "lobby" && (
        <button onClick={handleJoin} className="btn-accent px-4 py-2 rounded font-semibold text-sm transition-colors">Join</button>
      )}
      {canManage && tournament.status === "lobby" && tournament.players.length >= 2 && (
        <button
          onClick={handleStart}
          disabled={Boolean(scheduledStartPending)}
          className="btn-accent px-4 py-2 rounded font-semibold text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {scheduledStartPending ? "Scheduled" : "Start Tournament"}
        </button>
      )}
      {canManage && tournament.status === "paused" && (
        <button onClick={handleResume} className="btn-accent px-4 py-2 rounded font-semibold text-sm transition-colors">
          Resume
        </button>
      )}
      {/* Beside the way out, because both are things you do with the page
          rather than with the tournament. */}
      <ShareTournamentButton tournament={tournament} />
      <button onClick={() => navigate("/")} className="btn-secondary px-4 py-2 rounded text-sm transition-colors">
        Back home
      </button>
    </>
  );
}
