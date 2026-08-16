import PlayingCard, { CardBack } from "./PlayingCard";

export default function HoleCards({ cards, folded, eliminated, isMe, winningCards, raisedCards, faceDown, shine, size = "seat" }) {
  if (eliminated) return null;
  // A card you chose to show stands up out of the pair, so at a glance you can
  // tell which one the table is looking at — showing one of two is a real move,
  // and there is otherwise nothing on your own seat to say which one it was.
  const raised = new Set(raisedCards || []);
  const lift = (card) =>
    `transition-transform duration-300 ease-out ${raised.has(card) ? "-translate-y-[38%]" : ""}`;
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
    // hovering, which is only ever a reminder of what you just let go — unless
    // you showed it, in which case it is not a secret to fade out any more.
    if (!isMe) return null;
    return (
      <div
        title={raised.size ? "Shown to the table" : "Your mucked hand"}
        className={`flex gap-0.5 transition-opacity duration-200 ${
          raised.size ? "" : "opacity-15 hover:opacity-100"
        }`}
      >
        {(cards || []).length
          ? cards.map((card, index) => (
              <PlayingCard key={index} card={card} size={size} className={lift(card)} />
            ))
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
        <PlayingCard
          key={index}
          card={card}
          size={size}
          winning={winners.has(card)}
          shine={shine}
          className={lift(card)}
        />
      ))}
    </div>
  );
}
