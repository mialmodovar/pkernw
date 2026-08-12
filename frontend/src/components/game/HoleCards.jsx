import { SUIT_COLOR, SUIT_CHAR, CARD_FACE, CARD_BACK } from "./cardStyles";

function parseCard(str) {
  if (!str || str === "??") return null;
  const rank = str.slice(0, -1);
  const suitRaw = str.slice(-1);
  const suit = SUIT_CHAR[suitRaw] || suitRaw;
  return { rank, suit };
}

function CardFace({ card }) {
  if (!card) {
    return (
      <div className={`w-[clamp(1.6rem,3.6vw,2.25rem)] h-[clamp(2.3rem,5.2vw,3.25rem)] rounded flex items-center justify-center text-xs ${CARD_BACK}`}>
        ?
      </div>
    );
  }
  return (
    <div className={`w-[clamp(1.6rem,3.6vw,2.25rem)] h-[clamp(2.3rem,5.2vw,3.25rem)] rounded flex flex-col items-center justify-center text-xs font-bold ${CARD_FACE}`}
      style={{ color: SUIT_COLOR[card.suit] || "#161616" }}>
      <span>{card.rank}</span>
      <span className="text-[10px]">{card.suit}</span>
    </div>
  );
}

export default function HoleCards({ cards, folded, eliminated, isMe }) {
  if (eliminated) return null;
  if (folded) {
    // A mucked hand leaves the table. You can still peek at your own by
    // hovering, which is only ever a reminder of what you just let go.
    if (!isMe) return null;
    return (
      <div
        title="Your mucked hand"
        className="flex gap-0.5 opacity-15 hover:opacity-100 transition-opacity duration-200"
      >
        {(cards || []).length
          ? cards.map((c, i) => <CardFace key={i} card={parseCard(c)} />)
          : (<><CardFace card={null} /><CardFace card={null} /></>)}
      </div>
    );
  }
  if (!cards || cards.length === 0) {
    return (
      <div className="flex gap-0.5">
        <CardFace card={null} />
        <CardFace card={null} />
      </div>
    );
  }
  return (
    <div className="flex gap-0.5">
      {cards.map((c, i) => (
        <CardFace key={i} card={parseCard(c)} />
      ))}
    </div>
  );
}
