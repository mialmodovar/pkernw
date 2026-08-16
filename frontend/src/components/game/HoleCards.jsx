import PlayingCard, { CardBack } from "./PlayingCard";

export default function HoleCards({
  cards, folded, eliminated, isMe, winningCards, raisedCards, faceDown, shine,
  hideUntilHover = false, size = "seat",
}) {
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
  const faces = (
    <>
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
    </>
  );

  // Face down until you look. For anyone playing somewhere with people behind
  // them: the cards are covered by their own backs, and lifting them is a hover
  // — or a touch, which is the same gesture with one finger. Nothing is hidden
  // from the server or from the table, only from the room you are sitting in.
  if (hideUntilHover) {
    return (
      // Two names on one box. `group/cards` turns these cards into their own
      // hover target, so what lifts them is pointing at THEM — not at the
      // buttons beside them, which is what a group around the whole column
      // meant. `peer/hand` is how the read on the hand, which lives outside
      // this component, lifts with them without widening what triggers it.
      <div className="group/cards peer/hand relative flex gap-0.5 cursor-pointer"
        title="Hold to see your hand">
        <div className="flex gap-0.5 opacity-0 transition-opacity duration-150
                        group-hover/cards:opacity-100 group-active/cards:opacity-100">
          {faces}
        </div>
        <div aria-hidden="true"
          className="absolute inset-0 flex gap-0.5 transition-opacity duration-150
                     group-hover/cards:opacity-0 group-active/cards:opacity-0">
          <CardBack size={size} />
          <CardBack size={size} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-0.5">
      {faces}
    </div>
  );
}
