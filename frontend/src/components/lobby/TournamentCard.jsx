export default function TournamentCard({ tournament: t, onJoin, onOpen }) {
  const statusColor = {
    lobby: "bg-yellow-600",
    running: "bg-green-600",
    finished: "bg-gray-600",
  }[t.status];

  return (
    <div className="bg-gray-800 p-4 rounded-lg flex items-center justify-between">
      <div>
        <h3 className="font-semibold">{t.name}</h3>
        <p className="text-sm text-gray-400">
          Host: {t.host_name} &middot; {t.player_count}/{t.max_players} players &middot;{" "}
          {t.starting_chips.toLocaleString()} chips
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-xs px-2 py-1 rounded ${statusColor}`}>{t.status}</span>
        {t.status === "lobby" && (
          <button onClick={() => onJoin(t.id)}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm">
            Join
          </button>
        )}
        <button onClick={() => onOpen(t.id)}
          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">
          Open
        </button>
      </div>
    </div>
  );
}
