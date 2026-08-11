import useGameStore from "../../store/gameStore";

import { SUIT_COLOR, SUIT_CHAR, CARD_FACE } from "./cardStyles";

function CardView({ card: str }) {
  const rank = str.slice(0, -1);
  const suit = SUIT_CHAR[str.slice(-1)] || str.slice(-1);
  return (
    <div className={`w-11 h-16 rounded flex flex-col items-center justify-center font-bold ${CARD_FACE}`}
      style={{ color: SUIT_COLOR[suit] || "#141414" }}>
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
