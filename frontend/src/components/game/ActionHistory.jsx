import useGameStore from "../../store/gameStore";

export default function ActionHistory() {
  const messages = useGameStore((s) => s.messages);
  const showdown = useGameStore((s) => s.showdown);
  const potAwards = useGameStore((s) => s.potAwards);

  return (
    <div className="w-64 bg-gray-800 rounded-lg p-3 text-xs max-h-48 overflow-y-auto space-y-0.5">
      {messages.map((m, i) => (
        <div key={i} className="text-gray-400">{m}</div>
      ))}
      {showdown && showdown.map((s, i) => (
        <div key={`sd-${i}`} className="text-blue-300">
          Seat {s.seat}: {s.cards?.join(" ")} — {s.hand_name}
        </div>
      ))}
      {potAwards && potAwards.map((a, i) => (
        <div key={`pa-${i}`} className="text-yellow-300">
          Seat {a.seat} wins {a.amount?.toLocaleString()} [{a.description}]
        </div>
      ))}
    </div>
  );
}
