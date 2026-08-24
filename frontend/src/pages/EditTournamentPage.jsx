import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import api from "../api/http";
import { useTournamentId } from "../api/useTournamentId";
import CreateTournamentForm from "../components/lobby/CreateTournamentModal";
import useLobbyStore from "../store/lobbyStore";
import useAuthStore from "../store/authStore";

/**
 * Fixing a tournament nobody has played yet.
 *
 * The same form as creating one, handed the tournament to fill itself in
 * from — a separate edit form would be the same thirty fields kept in step
 * with these by hand. What cannot be edited it hides rather than disables:
 * the buy-in, the payouts and the bounties are what players joined on.
 */
export default function EditTournamentPage() {
  // Either the number or the name — see api/useTournamentId.js.
  const { key } = useParams();
  const { id, error: addressError } = useTournamentId(key, { correct: false });
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [tournament, setTournament] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api.get(`/tournaments/${id}/`)
      .then(({ data }) => setTournament(data))
      .catch(() => setError("That tournament could not be loaded."));
  }, [id]);

  const handleSave = async (payload) => {
    await api.patch(`/tournaments/${id}/edit/`, payload);
    // The lobby is showing the old settings until it hears otherwise.
    await useLobbyStore.getState().fetchLobbyData({ silent: true }).catch(() => {});
    navigate("/");
  };

  if (error || addressError) {
    return <p className="max-w-2xl mx-auto px-4 py-16 text-center text-(--color-text-muted)">{error || addressError}</p>;
  }
  if (!tournament) {
    return <p className="max-w-2xl mx-auto px-4 py-16 text-center text-(--color-text-muted)">Loading…</p>;
  }

  // The server is the gate; this only avoids landing on a form that cannot save.
  const mine = tournament.host_name === user?.username;
  if (!mine || tournament.status !== "lobby") {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-(--color-silver)">Not editable</h1>
        <p className="text-(--color-text-muted) text-sm mt-2">
          {mine
            ? "This tournament has already started."
            : "Only the host can change a tournament."}
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
        editing={tournament}
        onCancel={() => navigate("/")}
        onSave={handleSave}
      />
    </div>
  );
}
