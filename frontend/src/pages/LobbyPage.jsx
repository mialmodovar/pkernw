import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore from "../store/authStore";
import useLobbyStore from "../store/lobbyStore";
import TournamentBrowser from "../components/lobby/TournamentBrowser";
import ProfileCard from "../components/lobby/ProfileCard";
import StatsPanel from "../components/lobby/StatsPanel";
import ClubPanel from "../components/lobby/ClubPanel";
import CalotesPanel from "../components/lobby/CalotesPanel";
import WatchPanel from "../components/lobby/WatchPanel";

export default function LobbyPage() {
  const { user, logout } = useAuthStore();
  const { upcoming, mineActive, past, fetchLobbyData, loading } = useLobbyStore();
  const navigate = useNavigate();
  // Opening a tournament now takes site staff or a club you help run, and the
  // button follows the same rule the server does.
  const [staffsAClub, setStaffsAClub] = useState(false);
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

  useEffect(() => {
    fetchLobbyData();
    // Tournaments opening for late registration and seats freed by other
    // players both happen with no action of your own, so keep the lists live.
    // A failed tick is ignored because the next one recovers.
    const id = setInterval(() => {
      fetchLobbyData({ silent: true }).catch(() => {});
    }, 20000);
    return () => clearInterval(id);
  }, [fetchLobbyData]);

  const onJoin = async (id) => {
    await useLobbyStore.getState().joinTournament(id);
    navigate(`/tournament/${id}`);
  };
  const onOpen = (id) => navigate(`/tournament/${id}`);
  const onOpenTable = (id) => navigate(`/tournament/${id}/play`);
  const onEdit = (tournament) => navigate(`/tournaments/${tournament.id}/edit`);
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
      </aside>

      <main className="flex-1 min-h-0 flex flex-col gap-4">
        <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-(--color-silver) tracking-wide">Tournaments</h1>
          <div className="flex flex-wrap gap-3 items-center">
            {(user?.is_staff || staffsAClub) && (
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

        {loading ? (
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
          />
        )}
      </main>
    </div>
  );
}
