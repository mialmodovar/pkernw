import useGameStore from "../../store/gameStore";

export default function ActionHistory() {
  const messages = useGameStore((s) => s.messages);
  const showdown = useGameStore((s) => s.showdown);
  const potAwards = useGameStore((s) => s.potAwards);
  const rabbitCards = useGameStore((s) => s.rabbitCards);

  return (
    <div className="w-full lg:w-64 shrink-0 panel rounded-lg p-3 text-xs max-h-48 overflow-y-auto space-y-0.5">
      {messages.map((m, i) => (
        <div key={i} className="text-(--color-text-muted)">{m}</div>
      ))}
      {showdown && showdown.map((s, i) => (
        <div key={`sd-${i}`} className="text-(--color-silver)">
          Seat {s.seat}: {s.cards?.join(" ")} — {s.hand_name}
        </div>
      ))}
      {potAwards && potAwards.map((a, i) => (
        <div key={`pa-${i}`} className="text-[#d9c07a]">
          Seat {a.seat} wins {a.amount?.toLocaleString()} [{a.description}]
        </div>
      ))}
      {rabbitCards?.length > 0 && (
        <div className="text-[#c76b7a]">
          Rabbit: {rabbitCards.join(" ")}
        </div>
      )}
    </div>
  );
}
