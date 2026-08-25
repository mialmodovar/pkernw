import { useEffect } from "react";

import useGameStore from "../../store/gameStore";
import useWalletStore from "../../store/walletStore";
import Icon from "../icons/Icon";
import PlayingCard from "./PlayingCard";
import { useCompactLayout } from "./useCompactLayout";

export default function CommunityCards({ winningCards, shiningCards }) {
  const communityCards = useGameStore((s) => s.communityCards);
  // On a phone the board is five cards and a pot squeezed between two seats
  // that are most of the width of the screen. The card keeps its shape and
  // gives up the size it cannot have here.
  const compact = useCompactLayout();
  const boardSize = compact ? "boardCompact" : "board";
  // The cards that would have come if the hand had run out — and only if you
  // paid the five coins to see them. Until then all this client has is the
  // offer; the cards are on the server. See backend/game/rabbithunt.py.
  const rabbitCards = useGameStore((s) => s.rabbitCards);
  const rabbitOffer = useGameStore((s) => s.rabbitOffer);
  const rabbitBuyers = useGameStore((s) => s.rabbitBuyers);
  const buyRabbit = useGameStore((s) => s.buyRabbit);
  // The coins the look cost arrive with the cards, and the header's balance has
  // to move with them. Handed on here rather than in the store, which must not
  // reach into the wallet's — see the note on rabbitBalance.
  const rabbitBalance = useGameStore((s) => s.rabbitBalance);
  // Why the last press bought nothing. Said on the button for a few seconds and
  // then forgotten: it is an answer to a press, not a state of the table.
  const rabbitRefused = useGameStore((s) => s.rabbitRefused);
  const clearRabbitRefused = useGameStore((s) => s.clearRabbitRefused);
  useEffect(() => {
    if (!rabbitRefused) return undefined;
    const timer = setTimeout(clearRabbitRefused, 3000);
    return () => clearTimeout(timer);
  }, [rabbitRefused, clearRabbitRefused]);
  const setBalance = useWalletStore((s) => s.setBalance);
  useEffect(() => { setBalance(rabbitBalance); }, [rabbitBalance, setBalance]);
  const winners = new Set(winningCards || []);
  // The board half of a hand the hero's own cards made — see handShine.js. The
  // showdown ring takes over from it, and the two never overlap.
  const shining = new Set(shiningCards || []);
  const hasRabbit = Boolean(rabbitCards?.length) || Boolean(rabbitOffer?.count);
  // Two boards, when a table runs it twice or deals a bomb pot. The first of
  // them is `communityCards` and is what a hand has always had; this is only
  // the second, drawn under it and labelled, because a player looking at four
  // rows of cards needs to know which pot each one is deciding.
  const boards = useGameStore((s) => s.boards);
  const secondBoard = boards && boards.length > 1 ? boards[1] : null;
  if (!communityCards?.length && !hasRabbit) return null;
  return (
    <div className={secondBoard || rabbitBuyers.length
      ? "flex flex-col items-center gap-1.5" : ""}>
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
      {/* The offer, until it is bought. One button rather than the cards:
          somebody who just folded the winner may not want to know, and the
          cards are not on this client to show them until they say so. */}
      {rabbitOffer && !rabbitCards?.length && (
        <button
          type="button"
          onClick={buyRabbit}
          title={`Pay ${rabbitOffer.price} coins to see the cards that would have come`}
          className="ml-1 px-2 py-1 rounded-md text-xs font-semibold whitespace-nowrap
                     panel-raised text-(--color-text-muted) border border-dashed border-(--color-border)
                     hover:text-(--color-silver) hover:border-(--color-highlight) transition-colors"
        >
          {rabbitRefused === "coins" ? "🐇 Not enough coins" : "🐇 Rabbit hunt"}
          {/* The price on the button rather than in a dialogue: it is five
              coins, and a confirmation for five coins is worse than the spend. */}
          {!rabbitRefused && (
            <span className="ml-1 inline-flex items-center gap-0.5 text-(--color-highlight-text)">
              <Icon name="coin" className="w-3 h-3" tone="gold" />
              {rabbitOffer.price}
            </span>
          )}
        </button>
      )}

      {Boolean(rabbitCards?.length) && (
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

    {/* Who could not help themselves, shown to everybody. This is the half of
        rabbit hunting that a table has and a lone client does not: paying to
        find out is a tell, and it is a funny one. */}
    {rabbitBuyers.length > 0 && (
      <div className="flex items-center justify-center gap-1 flex-wrap">
        <span className="text-[9px] uppercase tracking-wide text-(--color-text-muted)">
          🐇 paid to look
        </span>
        {rabbitBuyers.map((one) => (
          <span
            key={one.user_id}
            className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold leading-none
                       bg-black/40 border border-(--color-border) text-(--color-silver)"
          >
            {one.name}
          </span>
        ))}
      </div>
    )}

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