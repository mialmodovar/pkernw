import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore from "../store/authStore";
import useLobbyStore from "../store/lobbyStore";
import TournamentList from "../components/lobby/TournamentList";
import ProfileCard from "../components/lobby/ProfileCard";
import StatsPanel from "../components/lobby/StatsPanel";
import LeaguePlaceholder from "../components/lobby/LeaguePlaceholder";
import CalotesPanel from "../components/lobby/CalotesPanel";

export default function LobbyPage() {
  const { user, logout } = useAuthStore();
  const { upcoming, mineActive, past, fetchLobbyData, loading } = useLobbyStore();
  const navigate = useNavigate();

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
  const onQuit = async (id) => {
    if (!window.confirm("Unregister from this tournament? Your seat is freed for someone else.")) return;
    await useLobbyStore.getState().quitTournament(id);
  };
  const onDelete = async (tournament) => {
    const seated = tournament.player_count || 0;
    const warning = seated > 1
      ? `Delete "${tournament.name}"? ${seated} players are registered and will lose their seats.`
      : `Delete "${tournament.name}"? This cannot be undone.`;
    if (!window.confirm(warning)) return;
    await useLobbyStore.getState().deleteTournament(tournament.id);
  };
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-6">
      <aside className="lg:w-72 shrink-0 space-y-4 lg:sticky lg:top-8 lg:self-start">
        <ProfileCard />
        <StatsPanel />
        <CalotesPanel />
        <LeaguePlaceholder />
      </aside>

      <main className="flex-1 space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-(--color-silver) tracking-wide">Tournaments</h1>
          <div className="flex flex-wrap gap-3 items-center">
            {user?.is_staff && (
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
          <>
            {mineActive.length > 0 && (
              <TournamentList
                title="Your Active Games"
                tournaments={mineActive}
                onJoin={onJoin}
                onOpen={onOpen}
              />
            )}
            <TournamentList
              title="Upcoming Tournaments"
              tournaments={upcoming}
              emptyMessage="No tournaments open right now. Create one!"
              onJoin={onJoin}
              onOpen={onOpen}
              onQuit={onQuit}
              onDelete={onDelete}
            />
            <TournamentList
              title="Past Tournaments"
              tournaments={past}
              emptyMessage="You haven't finished any tournaments yet."
              onJoin={onJoin}
              onOpen={onOpen}
            />
          </>
        )}
      </main>
    </div>
  );
}
