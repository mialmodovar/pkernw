import { SUIT_COLOR, SUIT_CHAR, CARD_FACE, CARD_BACK, CARD_WINNING } from "./cardStyles";

function parseCard(str) {
  if (!str || str === "??") return null;
  const rank = str.slice(0, -1);
  const suitRaw = str.slice(-1);
  const suit = SUIT_CHAR[suitRaw] || suitRaw;
  return { rank, suit };
}

function CardFace({ card, winning }) {
  if (!card) {
    return (
      <div className={`w-[clamp(1.6rem,3.6vw,2.25rem)] h-[clamp(2.3rem,5.2vw,3.25rem)] flex items-center justify-center ${CARD_BACK}`}>
        <span className="text-[0.7rem]">♠</span>
      </div>
    );
  }
  return (
    <div className={`w-[clamp(1.6rem,3.6vw,2.25rem)] h-[clamp(2.3rem,5.2vw,3.25rem)] flex flex-col items-center justify-center leading-none ${CARD_FACE} ${winning ? CARD_WINNING : ""}`}
      style={{ color: SUIT_COLOR[card.suit] || "#161616" }}>
      <span className="text-[0.95rem] font-black tracking-tight">{card.rank}</span>
      <span className="text-[0.85rem] leading-none -mt-0.5">{card.suit}</span>
    </div>
  );
}

export default function HoleCards({ cards, folded, eliminated, isMe, winningCards, faceDown }) {
  if (eliminated) return null;
  // Held face down until this seat's turn in the staged showdown reveal.
  if (faceDown) {
    return (
      <div className="flex gap-0.5">
        <CardFace card={null} />
        <CardFace card={null} />
      </div>
    );
  }
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
  const winners = new Set(winningCards || []);
  return (
    <div className="flex gap-0.5">
      {cards.map((c, i) => (
        <CardFace key={i} card={parseCard(c)} winning={winners.has(c)} />
      ))}
    </div>
  );
}
