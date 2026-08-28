import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { connect, disconnect, onMessage, onStatus, send, retry } from "../api/socket";
import useTableMedia from "../media/useTableMedia";
import useTableSounds from "../components/game/useTableSounds";
import ChatPanel, { ChatUnreadBadge } from "../components/game/ChatPanel";
import FloatingPanel from "../components/game/FloatingPanel";
import MediaControls from "../components/game/MediaControls";
import api from "../api/http";
import { useTournamentId } from "../api/useTournamentId";
import useGameStore from "../store/gameStore";
import useAuthStore from "../store/authStore";
import StartCountdown from "../components/game/StartCountdown";
import RebuyPrompt from "../components/game/RebuyPrompt";
import useSandboxStore from "../dev/sandboxStore";
import PokerTable from "../components/game/PokerTable";
import ActionPanel from "../components/game/ActionPanel";
import BlindLevelBar, { DisplayToggles } from "../components/game/BlindLevelBar";
import ActionHistory from "../components/game/ActionHistory";
import { useTurnAlert } from "../components/game/useTurnAlert";
import { useTimeoutAlert } from "../components/game/useTimeoutAlert";
import TournamentInfoPanel from "../components/game/TournamentInfoPanel";
import EliminationScreen from "../components/game/EliminationScreen";
import TableTabs from "../components/game/TableTabs";
import { markArrivedAtTable } from "../components/lobby/autoOpenTable";
import useTablesStore from "../store/tablesStore";
import BreakOverlay from "../components/game/BreakOverlay";
import TournamentCompleteScreen from "../components/game/TournamentCompleteScreen";
import HandReview from "../components/game/HandReview";
import PlayerStatsCard from "../components/game/PlayerStatsCard";
import ConnectionBanner from "../components/game/ConnectionBanner";
import { useCompactLayout } from "../components/game/useCompactLayout";
import { InfoIcon, LobbyIcon } from "../components/game/icons";
import TableVitals from "../components/game/TableVitals";
import SideBetPanel from "../components/game/SideBetPanel";
import BlackjackDrawer from "../components/game/BlackjackDrawer";
import useWalletStore from "../store/walletStore";
import ErrorBoundary from "../errors/ErrorBoundary";

// How long the table stays up after a hand ends your tournament — yours or
// everyone's. The last hand is the one worth looking at, and a result screen
// that arrives on the same beat as the pot means you never see it.
const RESULT_DELAY_MS = 8000;

export default function GamePage() {
  // The address may carry the tournament's name rather than its number; the
  // socket and every endpoint below want the number. See api/useTournamentId.js.
  const { key, watchTable } = useParams();
  const { id, error: addressError } = useTournamentId(key, {
    tail: watchTable != null ? `/watch/${watchTable}` : "/play",
  });
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
  const [infoOpen, setInfoOpen] = useState(false);
  const [playerStats, setPlayerStats] = useState({});
  const [inspecting, setInspecting] = useState(null);
  const compact = useCompactLayout();
  // Coins and what they have bought. Read once on arrival: the side-bet card
  // needs the balance and the throwable picker needs the shelf, and the table
  // is often the first page anybody opens.
  const fetchWallet = useWalletStore((s) => s.fetchWallet);
  // The layout sandbox renders this very page with no server behind it. Each
  // network call below is skipped and its result handed over instead.
  const sandbox = useSandboxStore((s) => s.active);
  const sandboxTournament = useSandboxStore((s) => s.tournament);
  const sandboxStats = useSandboxStore((s) => s.statsByName);

  const loadTournament = useCallback(async () => {
    if (!id) return;
    const { data } = await api.get(`/tournaments/${id}/`);
    setTournament(data);
  }, [id]);

  useEffect(() => { fetchWallet(); }, [fetchWallet]);

  // Cameras and microphones, kept in step with the table. Entirely separate
  // from the game: it reads the table, never writes to it.
  //
  // On while watching too. A spectator's camera is the other half of being able
  // to see the table's: watching without being seen is a one-way mirror, and the
  // server now lets the rail into the mesh — see game/consumers.py.
  //
  // On in the sandbox as well, which it was not: the sandbox exists to be this
  // page, and a page whose camera behaves differently there is a page the
  // sandbox cannot be used to test. It was how the reload restore looked broken
  // when it was only absent — see media/rejoinMedia.js. Nothing reaches a
  // server either way: the sandbox has no roster, so no peer is ever opened,
  // and every announcement goes into its send interceptor.
  useTableMedia();

  useEffect(() => {
    // Not until the address has been turned into a tournament: the socket is
    // opened on the number, so a name in the bar waits one request here.
    if (sandbox || !id) return undefined;
    // You are at a table. Anything that would later "take you to your table" is
    // from here on a drag backwards, so the arrival redirect is spent.
    markArrivedAtTable();
    // And this is the table "back to the table" means from now on, whichever
    // others are open.
    useTablesStore.getState().visited(id);
    // Stamped with the tournament, so the hand this table deals is remembered
    // against the right game once the page is left again.
    reset(id);
    connect(id, watching != null ? { spectateTable: watching } : {});
    const unsub = onMessage(handleEvent);
    const unsubStatus = onStatus(setConnectionStatus);
    return () => { unsub(); unsubStatus(); disconnect(); };
  }, [sandbox, id, watching, handleEvent, reset, setConnectionStatus]);

  // Watching a table is this browser's business — nothing on the server knows
  // or cares — so it is remembered here, and stays a tab until it is closed.
  useEffect(() => {
    if (sandbox || !id || watching == null) return;
    useTablesStore.getState().openWatch({
      id: Number(id),
      table: watching,
      name: tournament?.name || `Table ${watching}`,
    });
  }, [sandbox, id, watching, tournament?.name]);

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
    if (!id) return undefined;
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

  // The prizes are settled at the moment the tournament ends, so a detail
  // fetched a few seconds earlier does not have them. Read it again rather than
  // waiting for the next poll: the complete screen is drawn from this, and a
  // winner should not watch their own prize arrive late.
  useEffect(() => {
    if (standings && !sandbox) loadTournament();
  }, [sandbox, standings, loadTournament]);

  // A tournament that was already over when the table was opened has no hand to
  // play or watch, only a result — send them back rather than seat them at an
  // empty table waiting for players. Judged on arrival, so a tournament that
  // ends while you are sitting there still gets its final hand and standings.
  const arrivalStatus = useRef(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (sandbox || !tournament) return;
    if (arrivalStatus.current === null) arrivalStatus.current = tournament.status;
    if (arrivalStatus.current === "finished") {
      setLeaving(true);
      navigate("/", { replace: true });
    }
  }, [sandbox, tournament, navigate]);

  // You cannot watch from the rail while you are still in it: the watch route
  // would hide your own cards and buttons behind a spectator banner. Anyone
  // still holding a seat goes to that seat instead.
  useEffect(() => {
    if (sandbox || watching == null || !tournament) return;
    const mine = tournament.players?.find((p) => p.username === user?.username);
    if (mine && !mine.is_eliminated) navigate(`/tournament/${id}/play`, { replace: true });
  }, [sandbox, watching, tournament, user?.username, id, navigate]);

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
  // Back at the table with chips in front of you, whatever the last snapshot
  // said. That snapshot is refetched every few seconds, so buying straight
  // back in used to leave it claiming you were still out — long enough for the
  // elimination screen to arrive and offer you a rebuy the server then refused
  // on the grounds that you were not eliminated.
  const myLiveSeat = players.find((p) => (
    p.user_id != null && user?.id != null ? p.user_id === user.id : p.name === user?.username
  ));
  const backInPlay = Boolean(myLiveSeat && !myLiveSeat.is_eliminated && (myLiveSeat.chips ?? 0) > 0);
  const myEliminationFinish = backInPlay
    ? null
    : myFinish ?? (eliminatedByEvent ? lastElimination.finish_position : null);

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
  // Whether the blackjack drawer is up over the felt. Held here rather than in
  // the panel that opens it, because it has to be closed by something the panel
  // knows nothing about: your turn coming round again.
  const [blackjackOpen, setBlackjackOpen] = useState(false);
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
  // Who may pause the night, skip a level or resume it. The server's answer
  // rather than a name comparison: the host, whoever helps run the club, and
  // the superuser — a table stuck at two in the morning should be fixable by
  // whoever is actually around to fix it.
  const canManage = Boolean(tournament?.can_manage);
  const tournamentStatus = isPaused ? "paused" : tournament?.status;
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
  // The host's controls, and the one place their URLs are written. Built out of
  // the button's own word before this, which read fine and meant the paths only
  // existed at runtime — so nothing could check they were paths the server
  // serves. Now they are literals, and a test on the other side of the app
  // resolves every one of them.
  const ADMIN_PATHS = {
    start: `/tournaments/${id}/start/`,
    pause: `/tournaments/${id}/pause/`,
    resume: `/tournaments/${id}/resume/`,
    "skip-level": `/tournaments/${id}/skip-level/`,
  };

  const handleAdminControl = async (control) => {
    setAdminError("");
    if (sandbox) {
      if (control === "pause" || control === "resume") {
        useSandboxStore.getState().patch({ paused: control === "pause" });
      }
      return;
    }
    try {
      const path = ADMIN_PATHS[control];
      if (!path) return;
      await api.post(path);
      await loadTournament();
    } catch (error) {
      setAdminError(error.response?.data?.error || "Unable to update tournament.");
    }
  };

  // Already told they are out, so there is no hand left for them to watch: the
  // standings can take over the moment they arrive.
  const eliminationShowing = Boolean(myEliminationFinish) && eliminationReady && !spectating;

  if (leaving) return null;
  if (!sandbox && !id) {
    return (
      <p className="text-center mt-10 text-(--color-text-muted)">
        {addressError || "Loading..."}
      </p>
    );
  }

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
    // Nothing on a table is there to be copied — see .no-select in index.css,
    // which lets the chat, the hand history and every input opt back in.
    <div className="h-full flex flex-col overflow-hidden no-select">
      <ConnectionBanner status={connectionStatus} onRetry={retry} />
      {/* Every other table you have open. Draws nothing when this is the only
          one, which is most of the time. */}
      {!sandbox && <TableTabs currentId={Number(id)} />}
      {watching != null && (
        <div className="px-4 py-2 text-sm flex items-center justify-center gap-3 border-b
                        bg-(--color-highlight-dim) border-(--color-highlight-edge) text-(--color-highlight-pale)">
          <span>Watching table {currentTableNumber ?? watching} — you are not in this hand.</span>
          {/* The one control the rail gets. Being seen is a choice like it is
              anywhere else, and off is where it starts. */}
          <MediaControls />
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
        name={tournament?.name}
        controls={(
          <div className="flex items-center gap-2">
            {canManage && (tournamentStatus === "paused" ? (
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
            {canManage && (
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

      {/* Where you are, how the tournament is going, and the three things you
          might want to look at while you are there. Info, hand history and the
          lobby are all "step away from the hand for a moment" — they belong
          together, and none of them belongs up in the blind bar beside the
          clock controls. */}
      <div className="px-2 md:px-4 py-1.5 md:py-2 text-xs md:text-sm text-(--color-text-muted) flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
          <span className="truncate">{currentTableNumber ? `Table ${currentTableNumber}` : "Awaiting table assignment"}</span>
          {tableCount > 1 && (
            <span className="hidden lg:inline shrink-0">{`· ${tableCount} tables`}</span>
          )}
          <TableVitals tournament={tournament} />
          <button
            onClick={() => setInfoOpen((was) => !was)}
            title="Blinds, payouts, stacks and knockouts"
            aria-expanded={infoOpen}
            className={`shrink-0 flex items-center gap-1.5 ml-1 md:ml-2 px-2 md:px-3 py-1 rounded
                        text-xs font-semibold transition-colors ${infoOpen ? "btn-accent" : "btn-secondary"}`}
          >
            <InfoIcon />
            <span className="hidden md:inline">Info</span>
          </button>
          <ActionHistory onReview={() => setReviewOpen(true)} />
          {watching == null && (
            <button
              onClick={() => navigate(`/tournament/${id}`)}
              title="This tournament's lobby"
              className="btn-secondary shrink-0 flex items-center gap-1.5 px-2 md:px-3 py-1
                         rounded text-xs font-semibold transition-colors"
            >
              <LobbyIcon />
              <span className="hidden md:inline">Lobby</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
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
          <DisplayToggles />
          {watching == null && (
            <button
              onClick={() => send({ type: "sit_out", value: !amSittingOut })}
              title="You keep your seat and keep paying blinds; your turns pass automatically"
              className="btn-secondary px-2 md:px-3 py-1 rounded text-xs font-semibold transition-colors"
            >
              {amSittingOut ? "Sit in" : "Sit out"}
            </button>
          )}
        </div>
      </div>

      <div className={`table-area flex-1 min-h-0 flex items-center justify-center relative px-1 md:px-4 transition-shadow duration-300 ${
        isMyTurn ? "shadow-[inset_0_0_120px_var(--app-glow)]" : ""
      }`}>
        <TournamentInfoPanel
          tournament={tournament}
          username={user?.username}
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
        />
        {/* Callable from the rail too: watching a table you have no cards at
            is the purest version of what a side bet is for, and the coins are
            the wallet's rather than the table's. */}
        <SideBetPanel
          mySeat={mySeat}
          myUserId={user?.id}
          blackjackOpen={blackjackOpen}
          onOpenBlackjack={() => setBlackjackOpen(true)}
        />
        {/* Something to play while you are out of the hand. It closes itself
            the instant the table needs you — see BlackjackDrawer, where that
            rule is the whole reason it is safe to offer this at a money
            table. */}
        <BlackjackDrawer
          open={blackjackOpen}
          isMyTurn={isMyTurn}
          onClose={() => setBlackjackOpen(false)}
        />
        {/* Its own guard, inside the page's. The felt is the busiest thing on
            screen — eight seats, eight cameras, chips and cards in flight — and
            if it ever fails to draw, the buttons below it are what let you play
            the hand you are already in rather than sit there timing out. */}
        <ErrorBoundary label="table">
          <PokerTable mySeat={mySeat} capacity={capacity}
            statsByName={playerStats}
            onInspectPlayer={setInspecting} />
        </ErrorBoundary>

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
              // A definite width, set by the panel itself, rather than one
              // taken from the numbers printed on the buttons: a bigger pot
              // used to make a wider panel, and a panel pinned to this corner
              // grows leftwards — so every button moved when the amounts did.
              // Scaled down a little from the pinned corner it grows out of,
              // so it keeps its right and bottom edges and takes slightly less
              // of the felt back off the seat below it.
              // Half the felt less the widest a seat gets, so the panel stops
              // where the hero's own box begins. It used to be allowed the
              // whole width and took the seat below it with it.
              <div className="absolute bottom-2 right-2 z-20 w-max
                              max-w-[calc(50%-8rem)] scale-95 origin-bottom-right">
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
            onRebought={loadTournament}
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
          // Filed under the login name — `name` is the one they can change.
          stats={playerStats[inspecting.username]}
          isMe={inspecting.username === user?.username}
          onClose={() => setInspecting(null)}
        />
      )}

    </div>
  );
}
