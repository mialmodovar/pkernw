const SUIT_MAP = { "♥": "text-red-500", "♦": "text-blue-400", "♣": "text-green-400", "♠": "text-gray-900" };
const SUIT_CHAR = { h: "♥", d: "♦", c: "♣", s: "♠", "♥": "♥", "♦": "♦", "♣": "♣", "♠": "♠" };

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
      <div className="w-9 h-13 bg-blue-800 rounded border border-blue-600 flex items-center justify-center text-xs text-blue-400">
        ?
      </div>
    );
  }
  const color = SUIT_MAP[card.suit] || "text-gray-100";
  return (
    <div className={`w-9 h-13 bg-white rounded border border-gray-300 flex flex-col items-center justify-center text-xs font-bold ${color}`}>
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
