import { useShowCardsOffer } from "./showCards";

/**
 * Show what you had, once the hand is over.
 *
 * Lives in the action panel, where every other decision at this table is made,
 * and only between hands — telling the table what you hold while people are
 * still deciding is not a thing live poker lets you do either, and the server
 * refuses it regardless of what this offers.
 *
 * One card or both, because showing one is a real move and not a lesser version
 * of showing two. Showing anything buys the table a few more seconds before the
 * next deal, so what you showed can actually be seen.
 *
 * Not the only way any more: your cards on the seat are clickable for the same
 * window, which is where a player's hand actually is. This stays for "both",
 * for anybody who would rather press a labelled button, and because the row is
 * what tells you the window is open at all.
 */
export default function ShowCardsBar({ myCards, mySeat }) {
  const { canShow, betweenHands, show } = useShowCardsOffer(mySeat, myCards);

  const cards = myCards || [];
  // The cards themselves can be clicked mid-hand; this row waits for the hand
  // to be over. It lives among Fold and Call, and a reveal button in that row
  // while you are still deciding is a misclick with your stack on the line.
  if (!canShow || !betweenHands) return null;

  return (
    // No frame of its own: it sits inside the action panel, which has one.
    <div className="flex items-center gap-1.5 animate-fade-in">
      <span className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">Show</span>
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
