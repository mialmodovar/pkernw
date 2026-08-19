import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore from "../store/authStore";
import useLobbyStore from "../store/lobbyStore";
import useSpinGoStore from "../store/spinGoStore";
import TournamentBrowser from "../components/lobby/TournamentBrowser";
import SpinGoBrowser from "../components/lobby/SpinGoBrowser";
import { useAutoOpenTable } from "../components/lobby/autoOpenTable";
import { runsThePlace } from "../components/auth/runsThePlace";
import ProfileCard from "../components/lobby/ProfileCard";
import StatsPanel from "../components/lobby/StatsPanel";
import ClubPanel from "../components/lobby/ClubPanel";
import CalotesPanel from "../components/lobby/CalotesPanel";
import CoinPanel from "../components/lobby/CoinPanel";
import WatchPanel from "../components/lobby/WatchPanel";

// The two things you can be playing. Written as a list rather than two buttons
// so the strip is one loop, the way the filter chips inside the tournament
// browser are — and so a third format has one place to be added.
const LOBBY_TABS = [
  { key: "tournaments", label: "Tournaments" },
  { key: "spingo", label: "Spin n Go" },
];

/**
 * Watch your own Spin n Go and leave for the table the moment it fires.
 *
 * Kept here rather than inside the Spin n Go tab, because you can sit down and
 * then go back to reading the tournament list — and the game starts dealing
 * whether or not that tab is the one on screen.
 *
 * Strictly on the change from waiting to dealing. Sending you to the table
 * because you are *in* a running game is the mistake this used to make: it made
 * the lobby unreachable for as long as the game lasted, since every poll took
 * you straight back. Opening the app mid-game is a different case and belongs to
 * useAutoOpenTable, which spends its redirect once; walking back here on purpose
 * has TableShortcut for a way back and no argument about it.
 */
function useSpinGoWatch({ user }) {
  const navigate = useNavigate();
  const { myGame, fetchTiers } = useSpinGoStore();
  const waiting = myGame?.status === "lobby";
  const status = myGame?.status ?? null;
  const gameId = myGame?.id ?? null;
  const previous = useRef({ id: null, status: null });

  useEffect(() => {
    if (!user) return;
    fetchTiers();
  }, [user, fetchTiers]);

  // Two paces, like the tournament list: a queue you are sitting in can fill up
  // at any second and is worth knowing about immediately, and everything else
  // can wait.
  useEffect(() => {
    if (!user) return undefined;
    const id = setInterval(() => {
      fetchTiers({ silent: true }).catch(() => {});
    }, waiting ? 2000 : 8000);
    return () => clearInterval(id);
  }, [user, fetchTiers, waiting]);

  useEffect(() => {
    const before = previous.current;
    previous.current = { id: gameId, status };
    // The third player just sat down while you were looking at this page. Any
    // other combination — including finding yourself already in a running game —
    // is not a moment, and must not move you.
    const justFired = gameId != null && gameId === before.id
      && before.status === "lobby" && status === "running";
    // Replaced rather than pushed, so "back" from the table is the lobby you
    // were looking at and not a bounce straight back to the felt.
    if (justFired) navigate(`/tournament/${gameId}/play`, { replace: true });
  }, [gameId, status, navigate]);
}

export default function LobbyPage() {
  const { user, logout } = useAuthStore();
  const { upcoming, mineActive, past, fetchLobbyData, loading } = useLobbyStore();
  const navigate = useNavigate();
  // Opening a tournament now takes site staff or a club you help run, and the
  // button follows the same rule the server does.
  const [staffsAClub, setStaffsAClub] = useState(false);
  const [tab, setTab] = useState("tournaments");
  const onClubsLoaded = useCallback((clubs) => {
    setStaffsAClub(clubs.some((club) => club.my_role === "owner" || club.my_role === "staff"));
  }, []);

  // The three scopes overlap — a tournament you are seated at and that is open
  // for late registration comes back in two of them — so they are merged by id
  // rather than concatenated, or it would be listed twice.
  const tournaments = useMemo(() => {
    const byId = new Map();
    for (const tournament of [...mineActive, ...upcoming, ...past]) {
      byId.set(tournament.id, { ...byId.get(tournament.id), ...tournament });
    }
    return [...byId.values()];
  }, [mineActive, upcoming, past]);

  // A seat of yours that has started, or was already running when you opened
  // the app, takes you to the table — there is a hand waiting on you and this
  // list is not where you can play it.
  useAutoOpenTable({ tournaments, user, loading });
  useSpinGoWatch({ user });

  // Waiting on a tournament of your own to begin is the one thing on this page
  // that is worth knowing about the second it happens, because it starts
  // dealing you cards. The rest of the list can take its time.
  const awaitingStart = tournaments.some((t) => t.is_joined && t.status === "lobby");

  useEffect(() => { fetchLobbyData(); }, [fetchLobbyData]);

  // Tournaments opening for late registration and seats freed by other players
  // both happen with no action of your own, so keep the lists live. A failed
  // tick is ignored because the next one recovers. Separate from the first load
  // above so that changing pace does not put the loading placeholder back over
  // a list that is already on screen.
  useEffect(() => {
    const id = setInterval(() => {
      fetchLobbyData({ silent: true }).catch(() => {});
    }, awaitingStart ? 4000 : 20000);
    return () => clearInterval(id);
  }, [fetchLobbyData, awaitingStart]);

  const onJoin = async (id) => {
    await useLobbyStore.getState().joinTournament(id);
    navigate(`/tournament/${id}`);
  };
  const onOpen = (id) => navigate(`/tournament/${id}`);
  const onOpenTable = (id) => navigate(`/tournament/${id}/play`);
  const onEdit = (tournament) => navigate(`/tournaments/${tournament.id}/edit`);
  // A rebuy from here is a seat at a table that is already dealing, so it ends
  // at the table. A refusal — the level ticked over while the list sat there —
  // is worth saying out loud, because the button was offered.
  const onRebuy = async (id) => {
    try {
      await useLobbyStore.getState().rebuyTournament(id);
      navigate(`/tournament/${id}/play`);
    } catch (e) {
      window.alert(e.response?.data?.error || "Rebuy failed");
      fetchLobbyData({ silent: true }).catch(() => {});
    }
  };
  const onQuit = async (id) => {
    if (!window.confirm("Unregister from this tournament? Your seat is freed for someone else.")) return;
    await useLobbyStore.getState().quitTournament(id);
  };
  const onDelete = async (tournament) => {
    const seated = tournament.player_count || 0;
    // A paused tournament has been played, so the warning says what that
    // costs rather than the one about seats nobody has taken yet.
    const warning = tournament.status === "paused"
      ? `Delete "${tournament.name}"? It is paused mid-play — the hands already `
        + `played are lost, and the ${seated} players in it lose the tournament.`
      : seated > 1
      ? `Delete "${tournament.name}"? ${seated} players are registered and will lose their seats.`
      : `Delete "${tournament.name}"? This cannot be undone.`;
    if (!window.confirm(warning)) return;
    await useLobbyStore.getState().deleteTournament(tournament.id);
  };
  return (
    // Bounded to the viewport so the tournament list can scroll inside itself
    // rather than taking the whole page with it. dvh rather than vh: on a phone
    // the browser chrome is part of the height and moves as you scroll.
    <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-6
                    lg:h-[calc(100dvh-4rem)]">
      <aside className="lg:w-72 shrink-0 space-y-4 lg:sticky lg:top-8 lg:self-start">
        <ProfileCard />
        <StatsPanel />
        <CalotesPanel />
        <WatchPanel />
        <ClubPanel onClubsLoaded={onClubsLoaded} />
        <CoinPanel />
      </aside>

      <main className="flex-1 min-h-0 flex flex-col gap-4">
        <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* The two game modes, as the page's own heading. Same pill as the
              league tabs on a club page and the filter chips below. */}
          <div className="flex gap-2 items-center" role="tablist" aria-label="Game mode">
            {LOBBY_TABS.map((one) => (
              <button
                key={one.key}
                type="button"
                role="tab"
                aria-selected={tab === one.key}
                onClick={() => setTab(one.key)}
                className={`px-4 py-1.5 rounded-full text-lg font-bold tracking-wide border transition-colors ${
                  tab === one.key
                    ? "bg-(--color-accent) text-(--color-accent-text) border-(--color-border-strong)"
                    : "panel-raised text-(--color-text-muted) border-(--color-border) hover:text-(--color-silver)"
                }`}
              >
                {one.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            {tab === "tournaments" && (runsThePlace(user) || staffsAClub) && (
              <>
                <button onClick={() => navigate("/dev/table")}
                  title="Open the game table with mock players, for layout work"
                  className="btn-secondary px-3 py-2 rounded font-semibold text-sm transition-colors">
                  Table sandbox
                </button>
                <button onClick={() => navigate("/tournaments/new")}
                  className="btn-accent px-4 py-2 rounded font-semibold text-sm transition-colors">
                  Create Tournament
                </button>
              </>
            )}
            <button onClick={logout}
              className="px-3 py-2 panel-raised hover:border-(--color-border-strong) rounded text-sm text-(--color-silver) transition-colors">
              Logout
            </button>
          </div>
        </div>

        {tab === "spingo" ? (
          <SpinGoBrowser onOpenTable={onOpenTable} />
        ) : loading ? (
          <p className="text-(--color-text-muted)">Loading...</p>
        ) : (
          <TournamentBrowser
            tournaments={tournaments}
            onJoin={onJoin}
            onOpen={onOpen}
            onOpenTable={onOpenTable}
            onQuit={onQuit}
            onDelete={onDelete}
            onEdit={onEdit}
            onRebuy={onRebuy}
          />
        )}
      </main>
    </div>
  );
}
