import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { connect, disconnect, onMessage, onStatus, send, retry } from "../api/socket";
import useTableMedia from "../media/useTableMedia";
import useTableSounds from "../components/game/useTableSounds";
import ChatPanel, { ChatUnreadBadge } from "../components/game/ChatPanel";
import FloatingPanel from "../components/game/FloatingPanel";
import MediaControls from "../components/game/MediaControls";
import api from "../api/http";
import useGameStore from "../store/gameStore";
import useAuthStore from "../store/authStore";
import StartCountdown from "../components/game/StartCountdown";
import RebuyPrompt from "../components/game/RebuyPrompt";
import useSandboxStore from "../dev/sandboxStore";
import PokerTable from "../components/game/PokerTable";
import ActionPanel from "../components/game/ActionPanel";
import BlindLevelBar from "../components/game/BlindLevelBar";
import ActionHistory from "../components/game/ActionHistory";
import { useTurnAlert } from "../components/game/useTurnAlert";
import { useTimeoutAlert } from "../components/game/useTimeoutAlert";
import TournamentInfoPanel from "../components/game/TournamentInfoPanel";
import EliminationScreen from "../components/game/EliminationScreen";
import BreakOverlay from "../components/game/BreakOverlay";
import TournamentCompleteScreen from "../components/game/TournamentCompleteScreen";
import HandReview from "../components/game/HandReview";
import PlayerStatsCard from "../components/game/PlayerStatsCard";
import ConnectionBanner from "../components/game/ConnectionBanner";
import { useCompactLayout } from "../components/game/useCompactLayout";

// How long the table stays up after a hand ends your tournament — yours or
// everyone's. The last hand is the one worth looking at, and a result screen
// that arrives on the same beat as the pot means you never see it.
const RESULT_DELAY_MS = 8000;

export default function GamePage() {
  const { id, watchTable } = useParams();
  const navigate = useNavigate();
  // The watch route carries the table in its path, and that alone is what puts
  // this page behind the rail: no seat, no cards, nothing to send.
  const watching = watchTable != null ? Number(watchTable) : null;
  const user = useAuthStore((s) => s.user);
  const {
    handleEvent,
    reset,
    standings,
    players,
    isPaused,
    currentTableNumber,
    tableCount,
    tableSummaries,
    actionOnSeat,
    soundEnabled,
    lastElimination,
    level,
    handNumber,
    connectionStatus,
    setConnectionStatus,
    tableAssignmentNotice,
    dismissTableAssignmentNotice,
  } = useGameStore();
  const [tournament, setTournament] = useState(null);
  const [adminError, setAdminError] = useState("");
  // Busting out shouldn't yank the table away mid-river; and once told, a
  // player may want to stay and watch.
  const [eliminationReady, setEliminationReady] = useState(false);
  const [standingsReady, setStandingsReady] = useState(false);
  const [spectating, setSpectating] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [playerStats, setPlayerStats] = useState({});
  const [inspecting, setInspecting] = useState(null);
  const compact = useCompactLayout();
  // The layout sandbox renders this very page with no server behind it. Each
  // network call below is skipped and its result handed over instead.
  const sandbox = useSandboxStore((s) => s.active);
  const sandboxTournament = useSandboxStore((s) => s.tournament);
  const sandboxStats = useSandboxStore((s) => s.statsByName);

  const loadTournament = useCallback(async () => {
    const { data } = await api.get(`/tournaments/${id}/`);
    setTournament(data);
  }, [id]);

  // Cameras and microphones, kept in step with the table. Entirely separate
  // from the game: it reads the table, never writes to it.
  useTableMedia(!sandbox && watching == null);

  useEffect(() => {
    if (sandbox) return undefined;
    reset();
    connect(id, watching != null ? { spectateTable: watching } : {});
    const unsub = onMessage(handleEvent);
    const unsubStatus = onStatus(setConnectionStatus);
    return () => { unsub(); unsubStatus(); disconnect(); };
  }, [sandbox, id, watching, handleEvent, reset, setConnectionStatus]);

  // Chip counts drive the rank, average stack and chip leader, and they only
  // live in the DB, so refresh them periodically rather than once on mount.
  useEffect(() => {
    if (sandbox) {
      setTournament(sandboxTournament);
      return undefined;
    }
    loadTournament();
    const id = setInterval(loadTournament, 8000);
    return () => clearInterval(id);
  }, [sandbox, sandboxTournament, loadTournament]);

  // Reads on the other players. Lifetime figures, so they only move slowly —
  // the tournament poll is often enough.
  useEffect(() => {
    if (sandbox) {
      setPlayerStats(sandboxStats);
      return undefined;
    }
    let cancelled = false;
    const load = () => api.get(`/tournaments/${id}/player-stats/`)
      .then(({ data }) => {
        if (cancelled) return;
        setPlayerStats(Object.fromEntries(data.map((row) => [row.username, row])));
      })
      .catch(() => {});
    load();
    const timer = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [sandbox, sandboxStats, id]);

  // An elimination changes all of those at once. Without this the panel showed
  // a live "players left" beside a stale "your rank 4 of 4".
  useEffect(() => {
    if (lastElimination && !sandbox) loadTournament();
  }, [sandbox, lastElimination, loadTournament]);

  // A tournament that was already over when the table was opened has no hand to
  // play or watch, only a result — send them back rather than seat them at an
  // empty table waiting for players. Judged on arrival, so a tournament that
  // ends while you are sitting there still gets its final hand and standings.
  const wasOverOnArrival = useRef(null);
  useEffect(() => {
    if (sandbox || !tournament) return;
    if (wasOverOnArrival.current === null) {
      wasOverOnArrival.current = tournament.status === "finished";
    }
    if (wasOverOnArrival.current) navigate("/", { replace: true });
  }, [sandbox, tournament, navigate]);

  useEffect(() => {
    if (!tableAssignmentNotice) return undefined;
    const timeout = setTimeout(dismissTableAssignmentNotice, 7000);
    return () => clearTimeout(timeout);
  }, [dismissTableAssignmentNotice, tableAssignmentNotice]);

  // Sourced from REST rather than only the websocket event: an eliminated
  // player gets no snapshot on reconnect, so this has to survive a reload.
  const mySeatRecord = tournament?.players?.find((p) => p.username === user?.username);
  const myFinish = mySeatRecord?.is_eliminated ? mySeatRecord.finish_position : null;
  const eliminatedByEvent = lastElimination?.username === user?.username;
  const myEliminationFinish = myFinish ?? (eliminatedByEvent ? lastElimination.finish_position : null);

  // Let the hand finish playing out — the river, the showdown, the pot — before
  // taking the screen over.
  useEffect(() => {
    if (!myEliminationFinish) {
      setEliminationReady(false);
      setSpectating(false);
      return undefined;
    }
    const timer = setTimeout(() => setEliminationReady(true), RESULT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [myEliminationFinish]);

  // The last hand of a tournament is the one everybody wants to look at, and it
  // used to be swapped for the standings the instant the pot was awarded.
  useEffect(() => {
    if (!standings) {
      setStandingsReady(false);
      return undefined;
    }
    const timer = setTimeout(() => setStandingsReady(true), RESULT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [standings]);

  // Find "my" seat
  const mySeat = players.find((p) => p.username === user?.username)?.seat ?? null;
  const isMyTurn = mySeat !== null && actionOnSeat === mySeat;
  useTurnAlert(isMyTurn, soundEnabled);
  useTimeoutAlert(isMyTurn, soundEnabled);
  useTableSounds(soundEnabled);

  // Seat slots come from the table's capacity so seats don't shift on a bust.
  const capacity =
    tableSummaries.find((t) => t.table_number === currentTableNumber)?.max_seats
    ?? tournament?.players_per_table
    ?? 9;
  // The blind schedule is already on the fetched detail; level_index counts
  // breaks too, so it indexes it directly.
  const nextLevel = level?.level_index != null
    ? tournament?.levels?.[level.level_index + 1]
    : null;
  const isHost = tournament?.host_name === user?.username;
  const tournamentStatus = isPaused ? "paused" : tournament?.status;
  // Your seat is live, so the lobby gets a window of its own: leaving this tab
  // drops the table socket, and a hand does not wait for you to read standings.
  const amPlaying = watching == null && mySeat !== null && !myEliminationFinish;

  const amSittingOut = Boolean(players.find((p) => p.seat === mySeat)?.is_sitting_out);
  const handleAction = (action, amount) => send({ type: "player_action", action, amount });
  const actionPanel = (bare = false) => (
    <ActionPanel
      mySeat={mySeat}
      onAction={handleAction}
      disabled={connectionStatus !== "open"}
      amSittingOut={amSittingOut}
      onSitIn={() => send({ type: "sit_out", value: false })}
      bare={bare}
    />
  );
  const handleAdminControl = async (control) => {
    setAdminError("");
    if (sandbox) {
      if (control === "pause" || control === "resume") {
        useSandboxStore.getState().patch({ paused: control === "pause" });
      }
      return;
    }
    try {
      await api.post(`/tournaments/${id}/${control}/`);
      await loadTournament();
    } catch (error) {
      setAdminError(error.response?.data?.error || "Unable to update tournament.");
    }
  };

  // Already told they are out, so there is no hand left for them to watch: the
  // standings can take over the moment they arrive.
  const eliminationShowing = Boolean(myEliminationFinish) && eliminationReady && !spectating;

  if (wasOverOnArrival.current) return null;

  if (standings && (standingsReady || eliminationShowing)) {
    return (
      <TournamentCompleteScreen
        standings={standings}
        tournament={tournament}
        username={user?.username}
        handNumber={handNumber}
        level={level}
        onLeave={() => navigate("/")}
        onViewTournament={() => navigate(`/tournament/${id}`)}
      />
    );
  }

  if (eliminationShowing && !standings) {
    return (
      <EliminationScreen
        tournamentId={id}
        tournament={tournament}
        finishPosition={myEliminationFinish}
        reason={eliminatedByEvent ? lastElimination.reason : null}
        onRebought={() => { setSpectating(false); setEliminationReady(false); loadTournament(); }}
        onSpectate={() => setSpectating(true)}
        onLeave={() => navigate("/")}
      />
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      <ConnectionBanner status={connectionStatus} onRetry={retry} />
      {watching != null && (
        <div className="px-4 py-2 text-sm flex items-center justify-center gap-3 border-b
                        bg-(--color-highlight-dim) border-(--color-highlight-edge) text-(--color-highlight-pale)">
          <span>Watching table {currentTableNumber ?? watching} — you are not in this hand.</span>
          <button
            onClick={() => navigate(`/tournament/${id}`)}
            className="btn-secondary px-3 py-1 rounded text-xs font-semibold transition-colors"
          >
            Back to tournament
          </button>
        </div>
      )}
      {/* The tournament is over and the table is only still up so the last hand
          can be seen. Say so, and let anyone who has seen enough move on. */}
      {standings && !standingsReady && (
        <div className="px-4 py-2 text-sm flex items-center justify-center gap-3 border-b
                        bg-(--color-highlight-dim) border-(--color-highlight-edge) text-(--color-highlight-pale)">
          <span>That's the tournament — final hand.</span>
          <button
            onClick={() => setStandingsReady(true)}
            className="btn-secondary px-3 py-1 rounded text-xs font-semibold transition-colors"
          >
            Show standings
          </button>
        </div>
      )}
      {myEliminationFinish && spectating && (
        <div className="px-4 py-2 text-sm flex items-center justify-center gap-3 border-b
                        bg-[#3a1016] border-[rgba(196,178,165,0.25)] text-[#e3cdd1]">
          <span>You are out — spectating.</span>
          <button
            onClick={() => setSpectating(false)}
            className="btn-secondary px-3 py-1 rounded text-xs font-semibold transition-colors"
          >
            Show result
          </button>
        </div>
      )}
      <BlindLevelBar
        controls={(
          <div className="flex items-center gap-2">
            {amPlaying ? (
              <a
                href={`/tournament/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Opens in a new window so you keep your seat"
                className="btn-secondary px-2 py-0.5 rounded text-xs font-semibold transition-colors"
              >
                Lobby ↗
              </a>
            ) : watching == null && (
              <button
                onClick={() => navigate(`/tournament/${id}`)}
                className="btn-secondary px-2 py-0.5 rounded text-xs font-semibold transition-colors"
              >
                Lobby
              </button>
            )}
            {isHost && (tournamentStatus === "paused" ? (
              <button
                onClick={() => handleAdminControl("resume")}
                className="btn-accent px-2 py-0.5 rounded text-xs font-semibold transition-colors"
              >
                Resume
              </button>
            ) : (
              <button
                onClick={() => handleAdminControl("pause")}
                className="btn-secondary px-2 py-0.5 rounded text-xs font-semibold transition-colors"
              >
                Pause
              </button>
            ))}
            {isHost && (
              <button
                onClick={() => handleAdminControl("skip-level")}
                className="btn-secondary px-2 py-0.5 rounded text-xs font-semibold transition-colors"
              >
                Skip Level
              </button>
            )}
            {adminError && <span className="text-xs text-[#c76b7a]">{adminError}</span>}
          </div>
        )}
      />

      {tableAssignmentNotice && (
        <div className="fixed top-14 left-1/2 z-30 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl panel-raised px-4 py-3 shadow-2xl shadow-black/60">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-(--color-highlight-text)">Table move</div>
              <div className="mt-1 text-sm text-(--color-silver)">
                You were moved to table {tableAssignmentNotice.tableNumber}, seat {tableAssignmentNotice.seat}.
              </div>
              {tableAssignmentNotice.tableCount > 1 && (
                <div className="mt-1 text-xs text-(--color-text-muted)">
                  {tableAssignmentNotice.tableCount} active tables remain in this tournament.
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={dismissTableAssignmentNotice}
              className="rounded px-2 py-1 text-xs font-semibold text-(--color-text-muted) hover:bg-white/5 hover:text-(--color-silver) transition-colors"
              aria-label="Dismiss table move notice"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="px-2 md:px-4 py-1.5 md:py-2 text-xs md:text-sm text-(--color-text-muted) flex items-center justify-between gap-2">
        <span className="truncate">{currentTableNumber ? `Table ${currentTableNumber}` : "Awaiting table assignment"}</span>
        <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
          <span className="hidden md:inline">{tableCount > 0 ? `${tableCount} active table${tableCount === 1 ? "" : "s"}` : ""}</span>
          {watching != null && tableSummaries.length > 1 && (
            <div className="flex items-center gap-1">
              {tableSummaries.map((table) => (
                <button
                  key={table.table_number}
                  onClick={() => navigate(`/tournament/${id}/watch/${table.table_number}`)}
                  title={`Watch table ${table.table_number} · ${table.player_count} players`}
                  className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                    table.table_number === currentTableNumber ? "btn-accent" : "btn-secondary"
                  }`}
                >
                  T{table.table_number}
                </button>
              ))}
            </div>
          )}
          {watching == null && (
            <button
              onClick={() => setChatOpen(true)}
              className="md:hidden btn-secondary px-2 py-1 rounded text-xs font-semibold transition-colors"
            >
              Chat
            </button>
          )}
          <ActionHistory onReview={() => setReviewOpen(true)} />
          {watching == null && (
            <button
              onClick={() => send({ type: "sit_out", value: !amSittingOut })}
              title="You keep your seat and keep paying blinds; your turns pass automatically"
              className="btn-secondary px-2 md:px-3 py-1 rounded text-xs font-semibold transition-colors"
            >
              {amSittingOut ? "Sit in" : "Sit out"}
            </button>
          )}
          <button
            onClick={() => navigate("/")}
            title={watching == null ? "Your seat is kept — you can come back to the table" : "Back to every tournament"}
            className="btn-secondary px-2 md:px-3 py-1 rounded text-xs font-semibold transition-colors"
          >
            Home
          </button>
        </div>
      </div>

      <div className={`table-area flex-1 min-h-0 flex items-center justify-center relative px-1 md:px-4 transition-shadow duration-300 ${
        isMyTurn ? "shadow-[inset_0_0_120px_var(--app-glow)]" : ""
      }`}>
        <TournamentInfoPanel tournament={tournament} username={user?.username} />
        <PokerTable mySeat={mySeat} capacity={capacity}
          statsByName={playerStats}
          onInspectPlayer={setInspecting} />

        {/* On a desktop these float on the felt, and stay where you put them.
            A phone gets neither: the chat is a sheet and the action panel has a
            band of its own below the table. */}
        {!compact && (
          <>
            {/* Folded into its title bar to begin with. Chat is something you
                dip into between hands, and open it sits over the corner of the
                felt for the whole tournament whether anyone is talking or not.
                The unread count on the collapsed bar is what says otherwise. */}
            {watching == null && (
              <FloatingPanel
                id="chat" title="Table chat" anchor="bottom-left"
                defaultWidth={288} defaultHeight={192} minWidth={180} minHeight={110}
                defaultCollapsed
                actions={<MediaControls />}
                badge={<ChatUnreadBadge />}
              >
                <ChatPanel bare />
              </FloatingPanel>
            )}
            {/* Fixed in the bottom-right corner, with no title bar and nothing
                to drag or fold. Everything else on the felt is arrangeable
                because it is optional; this is where you act, and a control you
                have to find — or worse, unfold, while the clock runs — is not
                one you want to be looking for. */}
            {!spectating && watching == null && (
              // As wide as its contents need and no wider: the buttons carry
              // amounts, and a deep-stacked table asks for more room than a
              // short-stacked one. The floor stops it shrinking to a nub
              // between hands, and the ceiling stops it hanging off the felt.
              // It grows leftwards from a pinned corner, so the buttons keep
              // the same right edge whatever the numbers do.
              <div className="absolute bottom-2 right-2 z-20 w-max max-w-[calc(100%-1rem)]">
                {actionPanel()}
              </div>
            )}
          </>
        )}
        <StartCountdown myUserId={user?.id} />
        {/* Over the table rather than instead of it: the hand that busted you
            is still worth looking at while you decide. */}
        {watching == null && (
          <RebuyPrompt
            tournamentId={id}
            myUserId={user?.id}
            startingChips={tournament?.starting_chips}
          />
        )}
        <BreakOverlay level={level} nextLevel={nextLevel} />
        {isPaused && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-20">
            <div className="text-4xl font-bold text-(--color-silver)">Tournament Paused</div>
            <div className="text-(--color-text-muted) text-sm mt-3">Waiting for the host to resume.</div>
          </div>
        )}
      </div>

      {/* A phone gets a band of its own under the felt — an overlay here would
          sit on top of the hero's own cards. */}
      {compact && !spectating && watching == null && (
        <div className="shrink-0 px-1 pb-safe">
          {actionPanel()}
        </div>
      )}

      {reviewOpen && <HandReview tournamentId={id} onClose={() => setReviewOpen(false)} />}
      {chatOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 flex flex-col justify-end bg-black/70"
          onClick={() => setChatOpen(false)}
        >
          <div className="p-2 pb-safe space-y-2" onClick={(e) => e.stopPropagation()}>
            <ChatPanel className="w-full h-72" />
            <button
              onClick={() => setChatOpen(false)}
              className="btn-secondary w-full py-2 rounded text-sm font-semibold transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
      {inspecting && (
        <PlayerStatsCard
          player={inspecting}
          stats={playerStats[inspecting.name]}
          isMe={inspecting.username === user?.username}
          onClose={() => setInspecting(null)}
        />
      )}

    </div>
  );
}
