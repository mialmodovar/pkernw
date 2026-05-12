import { useNavigate } from "react-router-dom";
import CreateTournamentForm from "../components/lobby/CreateTournamentModal";
import useLobbyStore from "../store/lobbyStore";

export default function CreateTournamentPage() {
  const navigate = useNavigate();

  const handleCreate = async (payload) => {
    const tournament = await useLobbyStore.getState().createTournament(payload);
    navigate(`/tournament/${tournament.id}`);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-sm text-gray-400 hover:text-white"
        >
          Back to tournaments
        </button>
      </div>
      <CreateTournamentForm
        onCancel={() => navigate("/")}
        onCreate={handleCreate}
      />
    </div>
  );
}
