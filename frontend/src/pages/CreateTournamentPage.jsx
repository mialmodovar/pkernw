import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CreateTournamentForm from "../components/lobby/CreateTournamentModal";
import api from "../api/http";
import useLobbyStore from "../store/lobbyStore";
import useAuthStore from "../store/authStore";
import { opensTournaments } from "../components/auth/runsThePlace";

export default function CreateTournamentPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  // Whether they organise anywhere. Site staff is a flag on the account, but
  // club staff is a membership, so it has to be asked for — and until the
  // answer arrives nobody is turned away, or every club organiser would see
  // the refusal below for as long as the request took.
  const [clubs, setClubs] = useState(null);

  useEffect(() => {
    let live = true;
    api.get("/clubs/")
      .then(({ data }) => { if (live) setClubs(data); })
      // A club list that will not load must not become a locked door: the
      // server checks this properly when the form is submitted.
      .catch(() => { if (live) setClubs([]); });
    return () => { live = false; };
  }, []);

  const handleCreate = async (payload) => {
    const tournament = await useLobbyStore.getState().createTournament(payload);
    navigate(`/tournament/${tournament.id}`);
  };

  // Hiding the button is presentation; this is the actual gate on the route.
  // The server refuses regardless, but landing on a form that cannot submit is
  // a poor way to find that out. It asks the same question the server does:
  // site staff, or staff of a club — the second of which this used to ignore,
  // which is how a club organiser met "Staff only" behind a button the lobby
  // had drawn for them.
  if (user && clubs !== null && !opensTournaments(user, clubs)) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-(--color-silver)">Staff only</h1>
        <p className="text-(--color-text-muted) text-sm mt-2">
          Opening a tournament takes site staff, or staff of a club. Ask an
          organiser to set one up.
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
