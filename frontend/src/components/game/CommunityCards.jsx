import useGameStore from "../../store/gameStore";

const SUIT_MAP = { "♥": "text-red-500", "♦": "text-blue-400", "♣": "text-green-400", "♠": "text-gray-900" };
const SUIT_CHAR = { h: "♥", d: "♦", c: "♣", s: "♠" };

function CardView({ card: str }) {
  const rank = str.slice(0, -1);
  const suit = SUIT_CHAR[str.slice(-1)] || str.slice(-1);
  const color = SUIT_MAP[suit] || "text-gray-100";
  return (
    <div className={`w-11 h-16 bg-white rounded border border-gray-300 flex flex-col items-center justify-center font-bold ${color}`}>
      <span className="text-sm">{rank}</span>
      <span className="text-xs">{suit}</span>
    </div>
  );
}

export default function CommunityCards() {
  const communityCards = useGameStore((s) => s.communityCards);
  if (!communityCards || communityCards.length === 0) return null;
  return (
    <div className="flex gap-1">
      {communityCards.map((c, i) => <CardView key={i} card={c} />)}
    </div>
  );
}
