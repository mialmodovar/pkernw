import useGameStore from "../../store/gameStore";
import PlayingCard from "./PlayingCard";
import { useCompactLayout } from "./useCompactLayout";

export default function CommunityCards({ winningCards, shiningCards }) {
  const communityCards = useGameStore((s) => s.communityCards);
  // On a phone the board is five cards and a pot squeezed between two seats
  // that are most of the width of the screen. The card keeps its shape and
  // gives up the size it cannot have here.
  const compact = useCompactLayout();
  const boardSize = compact ? "boardCompact" : "board";
  // The cards that would have come if the hand had run out. The server has
  // been dealing these since rabbit hunting was added and nothing ever drew
  // them, so the setting appeared to do nothing at all.
  const rabbitCards = useGameStore((s) => s.rabbitCards);
  // Asked for, never volunteered: see the store.
  const rabbitRevealed = useGameStore((s) => s.rabbitRevealed);
  const revealRabbit = useGameStore((s) => s.revealRabbit);
  const winners = new Set(winningCards || []);
  // The board half of a hand the hero's own cards made — see handShine.js. The
  // showdown ring takes over from it, and the two never overlap.
  const shining = new Set(shiningCards || []);
  const hasRabbit = Boolean(rabbitCards?.length);
  // Two boards, when a table runs it twice or deals a bomb pot. The first of
  // them is `communityCards` and is what a hand has always had; this is only
  // the second, drawn under it and labelled, because a player looking at four
  // rows of cards needs to know which pot each one is deciding.
  const boards = useGameStore((s) => s.boards);
  const secondBoard = boards && boards.length > 1 ? boards[1] : null;
  if (!communityCards?.length && !hasRabbit) return null;
  return (
    <div className={secondBoard ? "flex flex-col items-center gap-1.5" : ""}>
    {secondBoard && (
      <span className="text-[9px] uppercase tracking-[0.2em] text-(--color-highlight-text)">
        Board 1
      </span>
    )}
    <div className="flex items-center gap-1">
      {(communityCards || []).map((card, index) => (
        // Keyed by the card itself so only newly dealt cards mount — and so
        // only they play the deal animation. The flop staggers; turn and river
        // are single cards and land immediately.
        <PlayingCard
          key={card}
          card={card}
          size={boardSize}
          winning={winners.has(card)}
          shine={shining.has(card)}
          className="animate-card-deal"
          style={{ animationDelay: `${index < 3 ? index * 90 : 0}ms` }}
        />
      ))}

      {/* What was never dealt, held apart from the real board and faded, so it
          can never be mistaken for a card anybody played. */}
      {/* The offer, until it is taken. One button rather than the cards,
          because somebody who just folded the winner may not want to know. */}
      {hasRabbit && !rabbitRevealed && (
        <button
          type="button"
          onClick={revealRabbit}
          title="Show the cards that would have come"
          className="ml-1 px-2 py-1 rounded-md text-xs font-semibold whitespace-nowrap
                     panel-raised text-(--color-text-muted) border border-dashed border-(--color-border)
                     hover:text-(--color-silver) hover:border-(--color-highlight) transition-colors"
        >
          🐇 Rabbit hunt
        </button>
      )}

      {hasRabbit && rabbitRevealed && (
        <span className="flex items-center gap-1 ml-1 pl-2 border-l border-dashed border-(--color-border)">
          {rabbitCards.map((card) => (
            <span key={`rabbit-${card}`} className="opacity-40 saturate-50">
              <PlayingCard card={card} size={boardSize} className="animate-card-deal" />
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

    {/* The second run-out, or the second half of a bomb pot. Half the pot is
        decided here and the other half above, which is the only thing anybody
        needs to understand about it. */}
    {secondBoard && (
      <>
        <span className="text-[9px] uppercase tracking-[0.2em] text-(--color-highlight-text)">
          Board 2
        </span>
        <div className="flex items-center gap-1">
          {secondBoard.map((card, index) => (
            <PlayingCard
              key={`b2-${card}`}
              card={card}
              size={boardSize}
              className="animate-card-deal"
              style={{ animationDelay: `${index < 3 ? index * 90 : 0}ms` }}
            />
          ))}
        </div>
      </>
    )}
    </div>
  );
}