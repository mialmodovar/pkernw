import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore from "../store/authStore";
import useLobbyStore from "../store/lobbyStore";
import TournamentList from "../components/lobby/TournamentList";

export default function LobbyPage() {
  const { user, logout } = useAuthStore();
  const { tournaments, fetchTournaments, loading } = useLobbyStore();
  const navigate = useNavigate();

  useEffect(() => { fetchTournaments(); }, [fetchTournaments]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Tournaments</h1>
        <div className="flex gap-3 items-center">
          <span className="text-sm text-gray-400">{user?.username}</span>
          <button onClick={() => navigate("/tournaments/new")}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-semibold text-sm">
            Create Tournament
          </button>
          <button onClick={logout}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">
            Logout
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading tournaments...</p>
      ) : (
        <TournamentList
          tournaments={tournaments}
          onJoin={async (id) => { await useLobbyStore.getState().joinTournament(id); navigate(`/tournament/${id}`); }}
          onOpen={(id) => navigate(`/tournament/${id}`)}
        />
      )}

    </div>
  );
}
