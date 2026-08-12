import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { connect, disconnect, onMessage, onStatus, send, retry } from "../api/socket";
import useTableMedia from "../media/useTableMedia";
import useTableSounds from "../components/game/useTableSounds";
import ChatPanel from "../components/game/ChatPanel";
import api from "../api/http";
import useGameStore from "../store/gameStore";
import useAuthStore from "../store/authStore";
import PokerTable from "../components/game/PokerTable";
import ActionPanel from "../components/game/ActionPanel";
import BlindLevelBar from "../components/game/BlindLevelBar";
import ActionHistory from "../components/game/ActionHistory";
import { useTurnAlert } from "../components/game/useTurnAlert";
import TournamentInfoPanel from "../components/game/TournamentInfoPanel";
import EliminationScreen from "../components/game/EliminationScreen";
import BreakOverlay from "../components/game/BreakOverlay";
import TournamentCompleteScreen from "../components/game/TournamentCompleteScreen";
import HandReview from "../components/game/HandReview";
import PlayerStatsCard from "../components/game/PlayerStatsCard";
import ConnectionBanner from "../components/game/ConnectionBanner";

export default function GamePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const {
    handleEvent,
    reset,
    standings,
    players,
    countdown,
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
  const [spectating, setSpectating] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [playerStats, setPlayerStats] = useState({});
  const [inspecting, setInspecting] = useState(null);

  const loadTournament = useCallback(async () => {
    const { data } = await api.get(`/tournaments/${id}/`);
    setTournament(data);
  }, [id]);

  // Cameras and microphones, kept in step with the table. Entirely separate
  // from the game: it reads the table, never writes to it.
  useTableMedia();

  useEffect(() => {
    reset();
    connect(id);
    const unsub = onMessage(handleEvent);
    const unsubStatus = onStatus(setConnectionStatus);
    return () => { unsub(); unsubStatus(); disconnect(); };
  }, [id, handleEvent, reset, setConnectionStatus]);

  // Chip counts drive the rank, average stack and chip leader, and they only
  // live in the DB, so refresh them periodically rather than once on mount.
  useEffect(() => {
    loadTournament();
    const id = setInterval(loadTournament, 8000);
    return () => clearInterval(id);
  }, [loadTournament]);

  // Reads on the other players. Lifetime figures, so they only move slowly —
  // the tournament poll is often enough.
  useEffect(() => {
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
  }, [id]);

  // An elimination changes all of those at once. Without this the panel showed
  // a live "players left" beside a stale "your rank 4 of 4".
  useEffect(() => {
    if (lastElimination) loadTournament();
  }, [lastElimination, loadTournament]);

  useEffect(() => {
    if (!tableAssignmentNotice) return undefined;
    const timeout = setTimeout(dismissTableAssignmentNotice, 7000);
    return () => clearTimeout(timeout);
  }, [dismissTableAssignmentNotice, tableAssignmentNotice]);

  // Sourced from REST rather than only the websocket event: an eliminated
  // player gets no snapshot on reconnect, so this has to survive a reload.
  const mySeatRecord = tournament?.players?.find((p) => p.username === user?.username);
  const myFinish = mySeatRecord?.is_eliminated ? mySeatRecord.finish_position : null;
  const eliminatedByEvent = lastElimination?.name === user?.username;
  const myEliminationFinish = myFinish ?? (eliminatedByEvent ? lastElimination.finish_position : null);

  // Let the hand finish playing out — the river, the showdown, the pot — before
  // taking the screen over.
  useEffect(() => {
    if (!myEliminationFinish) {
      setEliminationReady(false);
      setSpectating(false);
      return undefined;
    }
    const timer = setTimeout(() => setEliminationReady(true), 6000);
    return () => clearTimeout(timer);
  }, [myEliminationFinish]);

  // Find "my" seat
  const mySeat = players.find((p) => p.name === user?.username)?.seat ?? null;
  const isMyTurn = mySeat !== null && actionOnSeat === mySeat;
  useTurnAlert(isMyTurn, soundEnabled);
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

  const amSittingOut = Boolean(players.find((p) => p.seat === mySeat)?.is_sitting_out);
  const handleAction = (action, amount) => send({ type: "player_action", action, amount });
  const handleAdminControl = async (control) => {
    setAdminError("");
    try {
      await api.post(`/tournaments/${id}/${control}/`);
      await loadTournament();
    } catch (error) {
      setAdminError(error.response?.data?.error || "Unable to update tournament.");
    }
  };

  if (myEliminationFinish && !standings && eliminationReady && !spectating) {
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

  if (standings) {
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

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <ConnectionBanner status={connectionStatus} onRetry={retry} />
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
      <BlindLevelBar />

      {isHost && (
        <div className="px-4 py-2 panel border-x-0 border-t-0 flex flex-wrap items-center justify-between gap-2 text-sm">
          <div>
            <span className="text-(--color-text-muted)">Host controls</span>
            {adminError && <span className="ml-3 text-[#c76b7a]">{adminError}</span>}
          </div>
          <div className="flex gap-2">
            {tournamentStatus === "paused" ? (
              <button
                onClick={() => handleAdminControl("resume")}
                className="btn-accent px-3 py-1 rounded font-semibold transition-colors"
              >
                Resume
              </button>
            ) : (
              <button
                onClick={() => handleAdminControl("pause")}
                className="btn-secondary px-3 py-1 rounded font-semibold transition-colors"
              >
                Pause
              </button>
            )}
            <button
              onClick={() => handleAdminControl("skip-level")}
              className="btn-secondary px-3 py-1 rounded font-semibold transition-colors"
            >
              Skip Blind Level
            </button>
          </div>
        </div>
      )}

      {tableAssignmentNotice && (
        <div className="fixed top-14 left-1/2 z-30 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl panel-raised px-4 py-3 shadow-2xl shadow-black/60">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[#d9c07a]">Table move</div>
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

      <div className="px-4 py-2 text-sm text-(--color-text-muted) flex items-center justify-between gap-3">
        <span>{currentTableNumber ? `Table ${currentTableNumber}` : "Awaiting table assignment"}</span>
        <div className="flex items-center gap-3">
          <span>{tableCount > 0 ? `${tableCount} active table${tableCount === 1 ? "" : "s"}` : ""}</span>
          <ActionHistory onReview={() => setReviewOpen(true)} />
          <button
            onClick={() => send({ type: "sit_out", value: !amSittingOut })}
            title="You keep your seat and keep paying blinds; your turns pass automatically"
            className="btn-secondary px-3 py-1 rounded text-xs font-semibold transition-colors"
          >
            {amSittingOut ? "Sit back in" : "Sit out"}
          </button>
          <button
            onClick={() => navigate("/")}
            title="Your seat is kept — you can come back to the table"
            className="btn-secondary px-3 py-1 rounded text-xs font-semibold transition-colors"
          >
            Back to Lobby
          </button>
        </div>
      </div>

      <div className={`table-area flex-1 min-h-0 flex items-center justify-center relative px-4 transition-shadow duration-300 ${
        isMyTurn ? "shadow-[inset_0_0_120px_rgba(212,175,55,0.18)]" : ""
      }`}>
        <TournamentInfoPanel tournament={tournament} username={user?.username} />
        <PokerTable mySeat={mySeat} capacity={capacity}
          statsByName={playerStats}
          onInspectPlayer={setInspecting} />

        <div className="absolute bottom-2 left-2 z-10">
          <ChatPanel />
        </div>
        <div className="absolute bottom-2 right-2 z-10 w-[min(32rem,60%)]">
          <ActionPanel
            mySeat={mySeat}
            onAction={handleAction}
            disabled={connectionStatus !== "open"}
            amSittingOut={amSittingOut}
            onSitIn={() => send({ type: "sit_out", value: false })}
          />
        </div>
        {countdown !== null && countdown > 0 && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-20">
            <div className="text-(--color-text-muted) text-lg mb-2">Tournament starting in</div>
            <div className="text-6xl font-bold text-(--color-silver) tabular-nums">{countdown}</div>
            <div className="text-(--color-text-muted) text-sm mt-3">Waiting for all players to connect...</div>
          </div>
        )}
        <BreakOverlay level={level} nextLevel={nextLevel} />
        {isPaused && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-20">
            <div className="text-4xl font-bold text-(--color-silver)">Tournament Paused</div>
            <div className="text-(--color-text-muted) text-sm mt-3">Waiting for the host to resume.</div>
          </div>
        )}
      </div>

      {reviewOpen && <HandReview tournamentId={id} onClose={() => setReviewOpen(false)} />}
      {inspecting && (
        <PlayerStatsCard player={inspecting} stats={playerStats[inspecting.name]} onClose={() => setInspecting(null)} />
      )}

    </div>
  );
}
