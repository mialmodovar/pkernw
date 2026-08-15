import useGameStore from "../../store/gameStore";
import PlayingCard from "./PlayingCard";

export default function CommunityCards({ winningCards, shiningCards }) {
  const communityCards = useGameStore((s) => s.communityCards);
  // The cards that would have come if the hand had run out. The server has
  // been dealing these since rabbit hunting was added and nothing ever drew
  // them, so the setting appeared to do nothing at all.
  const rabbitCards = useGameStore((s) => s.rabbitCards);
  const winners = new Set(winningCards || []);
  // The board half of a hand the hero's own cards made — see handShine.js. The
  // showdown ring takes over from it, and the two never overlap.
  const shining = new Set(shiningCards || []);
  const hasRabbit = Boolean(rabbitCards?.length);
  if (!communityCards?.length && !hasRabbit) return null;
  return (
    <div className="flex items-center gap-1">
      {(communityCards || []).map((card, index) => (
        // Keyed by the card itself so only newly dealt cards mount — and so
        // only they play the deal animation. The flop staggers; turn and river
        // are single cards and land immediately.
        <PlayingCard
          key={card}
          card={card}
          size="board"
          winning={winners.has(card)}
          shine={shining.has(card)}
          className="animate-card-deal"
          style={{ animationDelay: `${index < 3 ? index * 90 : 0}ms` }}
        />
      ))}

      {/* What was never dealt, held apart from the real board and faded, so it
          can never be mistaken for a card anybody played. */}
      {hasRabbit && (
        <span className="flex items-center gap-1 ml-1 pl-2 border-l border-dashed border-(--color-border)">
          {rabbitCards.map((card) => (
            <span key={`rabbit-${card}`} className="opacity-40 saturate-50">
              <PlayingCard card={card} size="board" className="animate-card-deal" />
            </span>
          ))}
          {/* Set sideways so saying what these are costs no width on the felt. */}
          <span className="text-[8px] uppercase tracking-wide text-(--color-text-muted)
                           [writing-mode:vertical-rl] leading-none">
            would have been
          </span>
        </span>
      )}
    </div>
  );
}
