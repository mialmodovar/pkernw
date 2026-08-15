import { send } from "../../api/socket";
import useGameStore from "../../store/gameStore";

/**
 * Show what you had, once the hand is over.
 *
 * Only between hands — telling the table what you hold while people are still
 * deciding is not a thing live poker lets you do either, and the server refuses
 * it regardless of what this offers.
 *
 * One card or both, because showing one is a real move and not a lesser version
 * of showing two. Showing anything buys the table a few more seconds before the
 * next deal, so what you showed can actually be seen.
 */
export default function ShowCardsBar({ myCards, mySeat }) {
  const open = useGameStore((s) => s.showCardsOpen);
  // Nothing to offer once your cards are already face up. That covers all three
  // ways it happens — a showdown, an all-in runout, or having just shown them
  // yourself — because each of those puts the cards on your own seat, and a
  // seat with cards on it is a hand everybody can already see.
  //
  // Reading the seat rather than remembering the click also means the bar goes
  // when the server confirms, not when the button is pressed: the reveal window
  // opens a beat after the hand ends, and a click that lands early is refused.
  const alreadyPublic = useGameStore((s) => (
    mySeat == null ? false : Boolean(s.players.find((p) => p.seat === mySeat)?.cards?.length)
  ));

  const cards = myCards || [];
  if (!open || alreadyPublic || cards.length === 0) return null;

  const show = (indices) => send({ type: "show_cards", cards: indices });

  return (
    <div className="flex items-center gap-1.5 panel rounded-full px-2 py-1 shadow-lg shadow-black/50 animate-fade-in">
      <span className="text-[10px] uppercase tracking-wide text-(--color-text-muted) pl-1">Show</span>
      {cards.map((card, index) => (
        <button
          key={card}
          type="button"
          onClick={() => show([index])}
          title={`Show only ${card}`}
          className="px-2 py-0.5 rounded panel-raised text-[11px] font-semibold
                     text-(--color-silver) hover:border-(--color-highlight) border border-transparent
                     transition-colors"
        >
          {card}
        </button>
      ))}
      {cards.length > 1 && (
        <button
          type="button"
          onClick={() => show([0, 1])}
          title="Show both cards"
          className="px-2 py-0.5 rounded text-[11px] font-bold btn-accent transition-colors"
        >
          Both
        </button>
      )}
    </div>
  );
}
