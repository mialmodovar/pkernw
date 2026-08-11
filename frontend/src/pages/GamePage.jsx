import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { connect, disconnect, onMessage, clearListeners, send } from "../api/socket";
import useGameStore from "../store/gameStore";
import useAuthStore from "../store/authStore";
import PokerTable from "../components/game/PokerTable";
import ActionPanel from "../components/game/ActionPanel";
import BlindLevelBar from "../components/game/BlindLevelBar";
import ActionHistory from "../components/game/ActionHistory";

export default function GamePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { handleEvent, reset, standings, players, countdown, currentTableNumber, tableCount } = useGameStore();

  useEffect(() => {
    reset();
    connect(id);
    const unsub = onMessage(handleEvent);
    return () => { unsub(); clearListeners(); disconnect(); };
  }, [id]);

  // Find "my" seat
  const mySeat = players.find((p) => p.name === user?.username)?.seat ?? null;

  const handleAction = (action, amount) => send({ type: "player_action", action, amount });

  if (standings) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <h1 className="text-3xl font-bold mb-6">Tournament Complete</h1>
        <ol className="bg-gray-800 rounded-lg divide-y divide-gray-700">
          {standings.map((s) => (
            <li key={s.seat} className="px-6 py-3 flex justify-between">
              <span className="font-mono text-gray-400">{s.finish}.</span>
              <span className="font-semibold">{s.name}</span>
            </li>
          ))}
        </ol>
        <button onClick={() => navigate("/")}
          className="mt-6 px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded font-semibold">
          Back to Lobby
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <BlindLevelBar />

      <div className="px-4 py-2 text-sm text-gray-400 flex justify-between">
        <span>{currentTableNumber ? `Table ${currentTableNumber}` : "Awaiting table assignment"}</span>
        <span>{tableCount > 0 ? `${tableCount} active table${tableCount === 1 ? "" : "s"}` : ""}</span>
      </div>

      <div className="flex-1 flex items-center justify-center relative">
        <PokerTable mySeat={mySeat} />
        {countdown !== null && countdown > 0 && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-20">
            <div className="text-gray-400 text-lg mb-2">Tournament starting in</div>
            <div className="text-6xl font-bold text-white tabular-nums">{countdown}</div>
            <div className="text-gray-500 text-sm mt-3">Waiting for all players to connect...</div>
          </div>
        )}
      </div>

      <div className="flex gap-4 px-4 pb-4">
        <div className="flex-1">
          <ActionPanel mySeat={mySeat} onAction={handleAction} />
        </div>
        <ActionHistory />
      </div>
    </div>
  );
}
