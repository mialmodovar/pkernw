import useGameStore from "../../store/gameStore";
import PlayingCard from "./PlayingCard";

export default function CommunityCards({ winningCards }) {
  const communityCards = useGameStore((s) => s.communityCards);
  const winners = new Set(winningCards || []);
  if (!communityCards || communityCards.length === 0) return null;
  return (
    <div className="flex gap-1">
      {communityCards.map((card, index) => (
        // Keyed by the card itself so only newly dealt cards mount — and so
        // only they play the deal animation. The flop staggers; turn and river
        // are single cards and land immediately.
        <PlayingCard
          key={card}
          card={card}
          size="board"
          winning={winners.has(card)}
          className="animate-card-deal"
          style={{ animationDelay: `${index < 3 ? index * 90 : 0}ms` }}
        />
      ))}
    </div>
  );
}
