import { useNavigate } from "react-router-dom";
import CreateTournamentForm from "../components/lobby/CreateTournamentModal";
import useLobbyStore from "../store/lobbyStore";
import useAuthStore from "../store/authStore";
import { runsThePlace } from "../components/auth/runsThePlace";

export default function CreateTournamentPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const handleCreate = async (payload) => {
    const tournament = await useLobbyStore.getState().createTournament(payload);
    navigate(`/tournament/${tournament.id}`);
  };

  // Hiding the button is presentation; this is the actual gate on the route.
  // The server refuses regardless, but landing on a form that cannot submit is
  // a poor way to find that out.
  if (user && !runsThePlace(user)) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-(--color-silver)">Staff only</h1>
        <p className="text-(--color-text-muted) text-sm mt-2">
          Only staff can open a tournament. Ask an organiser to set one up.
        </p>
        <button
          onClick={() => navigate("/")}
          className="btn-secondary mt-6 px-4 py-2 rounded font-semibold transition-colors"
        >
          Back home
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-sm text-(--color-text-muted) hover:text-(--color-silver) transition-colors"
        >
          Back home
        </button>
      </div>
      <CreateTournamentForm
        onCancel={() => navigate("/")}
        onCreate={handleCreate}
      />
    </div>
  );
}
