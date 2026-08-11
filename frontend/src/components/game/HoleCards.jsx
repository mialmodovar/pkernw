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
      <div className={`w-9 h-13 rounded flex items-center justify-center text-xs ${CARD_BACK}`}>
        ?
      </div>
    );
  }
  return (
    <div className={`w-9 h-13 rounded flex flex-col items-center justify-center text-xs font-bold ${CARD_FACE}`}
      style={{ color: SUIT_COLOR[card.suit] || "#161616" }}>
      <span>{card.rank}</span>
      <span className="text-[10px]">{card.suit}</span>
    </div>
  );
}

export default function HoleCards({ cards, folded, eliminated }) {
  if (eliminated) return null;
  if (folded) {
    return (
      <div className="flex gap-0.5 opacity-30">
        <CardFace card={null} />
        <CardFace card={null} />
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
