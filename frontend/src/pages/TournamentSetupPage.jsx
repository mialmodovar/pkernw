import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/http";
import useAuthStore from "../store/authStore";

export default function TournamentSetupPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [tournament, setTournament] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    const { data } = await api.get(`/tournaments/${id}/`);
    setTournament(data);
    if (data.status === "running") navigate(`/tournament/${id}/play`);
  };

  useEffect(() => { load(); const iv = setInterval(load, 3000); return () => clearInterval(iv); }, [id]);

  if (!tournament) return <p className="text-center mt-10 text-gray-400">Loading...</p>;

  const isHost = tournament.host_name === user?.username;
  const joined = tournament.players?.some((p) => p.username === user?.username);

  const handleJoin = async () => {
    try { await api.post(`/tournaments/${id}/join/`); load(); } catch (e) { setError(e.response?.data?.error || "Error"); }
  };
  const handleStart = async () => {
    try { await api.post(`/tournaments/${id}/start/`); navigate(`/tournament/${id}/play`); } catch (e) { setError(e.response?.data?.error || "Error"); }
  };

  const playableLevels = tournament.levels.filter((level) => !level.is_break).length;

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-2">{tournament.name}</h1>
      <p className="text-gray-400 mb-6">
        Host: {tournament.host_name} &middot; {tournament.starting_chips.toLocaleString()} chips &middot;{" "}
        <span className="text-yellow-400">{tournament.status}</span>
      </p>

      <div className="grid gap-3 sm:grid-cols-2 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Seating</p>
          <p className="text-sm text-gray-200">{tournament.max_players} total players</p>
          <p className="text-sm text-gray-400">{tournament.players_per_table} players per table</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Registration</p>
          <p className="text-sm text-gray-200">
            {tournament.late_reg_level > 0 ? `Late reg through level ${tournament.late_reg_level}` : "Late reg disabled"}
          </p>
          <p className="text-sm text-gray-400">
            {tournament.allow_rebuys
              ? `${tournament.max_rebuys} rebuys through level ${tournament.rebuy_level}`
              : "Rebuys disabled"}
          </p>
        </div>
      </div>

      <h2 className="font-semibold mb-2">Players ({tournament.players.length}/{tournament.max_players})</h2>
      <ul className="bg-gray-800 rounded-lg divide-y divide-gray-700 mb-6">
        {tournament.players.map((p) => (
          <li key={p.id} className="px-4 py-2 flex justify-between">
            <span>{p.username}</span>
            <span className="text-gray-500">Seat {p.seat}</span>
          </li>
        ))}
      </ul>

      <h2 className="font-semibold mb-2">Blind Schedule</h2>
      <ul className="bg-gray-800 rounded-lg divide-y divide-gray-700 mb-6 text-sm">
        {tournament.levels.map((level, index) => (
          <li key={level.id} className="px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-gray-100">
                {level.is_break ? `Break ${index + 1}` : `Level ${tournament.levels.slice(0, index + 1).filter((item) => !item.is_break).length}`}
              </p>
              <p className="text-gray-400">
                {level.is_break
                  ? "Pause in play"
                  : `SB ${level.small_blind} / BB ${level.big_blind}${level.ante ? ` / Ante ${level.ante}` : ""}`}
              </p>
            </div>
            <span className="text-gray-500">
              {level.is_break
                ? `${level.duration_minutes} min`
                : level.duration_minutes != null
                  ? `${level.duration_minutes} min`
                  : `${level.duration_hands} hands`}
            </span>
          </li>
        ))}
      </ul>

      {playableLevels === 0 && <p className="text-sm text-red-400 mb-4">Tournament needs at least one playable blind level.</p>}

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

      <div className="flex gap-3">
        {!joined && tournament.status === "lobby" && (
          <button onClick={handleJoin} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-semibold">Join</button>
        )}
        {isHost && tournament.status === "lobby" && tournament.players.length >= 2 && (
          <button onClick={handleStart} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded font-semibold">Start Tournament</button>
        )}
        <button onClick={() => navigate("/")} className="px-4 py-2 bg-gray-700 rounded">Back</button>
      </div>
    </div>
  );
}
