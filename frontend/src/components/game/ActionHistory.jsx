import { useEffect, useRef } from "react";
import useGameStore from "../../store/gameStore";

const STREET_LABEL = { preflop: "Preflop", flop: "Flop", turn: "Turn", river: "River" };

const KIND_STYLE = {
  action: "text-(--color-silver)",
  blinds: "text-(--color-text-muted)",
  street: "text-[#d9c07a]",
  showdown: "text-(--color-silver) font-medium",
  pot: "text-[#d9c07a] font-semibold",
  elim: "text-[#c76b7a]",
  error: "text-[#c76b7a] font-semibold",
  info: "text-(--color-text-muted) italic",
};

// Groups the flat entry list into hands, and each hand into its streets, so the
// log reads as a hand history rather than one undifferentiated stream.
function groupByHand(entries) {
  const hands = [];
  for (const item of entries) {
    if (item.kind === "info" || item.kind === "error") {
      hands.push({ loose: item });
      continue;
    }
    let hand = hands[hands.length - 1];
    if (!hand || hand.loose || hand.number !== item.hand) {
      hand = { number: item.hand, streets: [] };
      hands.push(hand);
    }
    if (item.kind === "hand") continue; // the header already carries the number
    let street = hand.streets[hand.streets.length - 1];
    if (!street || street.name !== item.street) {
      street = { name: item.street, items: [] };
      hand.streets.push(street);
    }
    street.items.push(item);
  }
  return hands;
}

export default function ActionHistory({ onReview }) {
  const messages = useGameStore((s) => s.messages);
  const scroller = useRef(null);

  // Stick to the newest entry — that's the part worth reading.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const hands = groupByHand(messages);

  return (
    <div className="w-full lg:w-72 shrink-0 panel rounded-lg flex flex-col max-h-64">
      <div className="px-3 py-2 border-b border-(--color-border) flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-(--color-silver)">
          Hand history
        </span>
        {onReview && (
          <button
            onClick={onReview}
            title="Replay the last few completed hands"
            className="btn-secondary px-2 py-0.5 rounded text-[10px] font-semibold transition-colors"
          >
            Review
          </button>
        )}
      </div>
      <div ref={scroller} className="flex-1 overflow-y-auto px-3 py-2 text-xs space-y-2">
        {hands.length === 0 && (
          <p className="text-(--color-text-muted)">No hands played yet.</p>
        )}
        {hands.map((hand, i) => hand.loose ? (
          <div key={hand.loose.id} className={KIND_STYLE[hand.loose.kind]}>
            {hand.loose.text}
          </div>
        ) : (
          <div key={`${hand.number}-${i}`} className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-(--color-text-muted)
                            border-b border-(--color-border) pb-0.5">
              Hand #{hand.number}
            </div>
            {hand.streets.map((street, j) => (
              <div key={`${street.name}-${j}`} className="pl-1">
                {street.name && (
                  <div className="text-[10px] font-semibold text-[#a8632c] uppercase tracking-wide">
                    {STREET_LABEL[street.name] || street.name}
                  </div>
                )}
                {street.items.map((item) => (
                  <div key={item.id} className={`pl-1.5 ${KIND_STYLE[item.kind] || ""}`}>
                    {item.text}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
