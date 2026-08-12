import useGameStore from "../../store/gameStore";

import { SUIT_COLOR, SUIT_CHAR, CARD_FACE, CARD_WINNING } from "./cardStyles";

function CardView({ card: str, delay, winning }) {
  const rank = str.slice(0, -1);
  const suit = SUIT_CHAR[str.slice(-1)] || str.slice(-1);
  return (
    <div className={`w-[clamp(2rem,4.5vw,2.75rem)] h-[clamp(2.9rem,6.5vw,4rem)] flex flex-col items-center justify-center leading-none animate-card-deal ${CARD_FACE} ${winning ? CARD_WINNING : ""}`}
      style={{ color: SUIT_COLOR[suit] || "#141414", animationDelay: `${delay}ms` }}>
      <span className="text-[0.95rem] font-extrabold tracking-tight">{rank}</span>
      <span className="text-[0.8rem] mt-0.5">{suit}</span>
    </div>
  );
}

export default function CommunityCards({ winningCards }) {
  const communityCards = useGameStore((s) => s.communityCards);
  const winners = new Set(winningCards || []);
  if (!communityCards || communityCards.length === 0) return null;
  return (
    <div className="flex gap-1">
      {communityCards.map((c, i) => (
        // Keyed by the card itself so only newly dealt cards mount — and so
        // only they play the deal animation. The flop staggers; turn and river
        // are single cards and land immediately.
        <CardView key={c} card={c} delay={i < 3 ? i * 90 : 0} winning={winners.has(c)} />
      ))}
    </div>
  );
}
