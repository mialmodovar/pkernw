import PlayingCard, { CardBack } from "./PlayingCard";

export default function HoleCards({ cards, folded, eliminated, isMe, winningCards, faceDown, size = "seat" }) {
  if (eliminated) return null;
  // Held face down until this seat's turn in the staged showdown reveal.
  if (faceDown) {
    return (
      <div className="flex gap-0.5">
        <CardBack size={size} />
        <CardBack size={size} />
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
          ? cards.map((card, index) => <PlayingCard key={index} card={card} size={size} />)
          : (<><CardBack size={size} /><CardBack size={size} /></>)}
      </div>
    );
  }
  if (!cards || cards.length === 0) {
    return (
      <div className="flex gap-0.5">
        <CardBack size={size} />
        <CardBack size={size} />
      </div>
    );
  }
  const winners = new Set(winningCards || []);
  return (
    <div className="flex gap-0.5">
      {cards.map((card, index) => (
        <PlayingCard key={index} card={card} size={size} winning={winners.has(card)} />
      ))}
    </div>
  );
}
