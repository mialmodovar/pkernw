import { useEffect, useState } from "react";

import PlayingCard, { CardBack } from "./PlayingCard";

/** How long a card stays armed before it forgets it was asked. On a phone the
 *  gesture for peeking at your own hand is a tap, and a tap that leaves "Show?"
 *  sitting there until you deal with it is a trap. */
const ARMED_MS = 4000;

export default function HoleCards({
  cards, folded, eliminated, isMe, winningCards, raisedCards, faceDown, shine,
  hideUntilHover = false, size = "seat", onShowCard = null, confirmShow = false,
}) {
  // Which card has been asked about but not yet shown. Mid-hand only: showing
  // a card while the others are still deciding is worth doing on purpose and
  // catastrophic by accident, and on a phone the peek gesture is the same tap.
  const [armed, setArmed] = useState(null);

  useEffect(() => {
    if (armed == null) return undefined;
    const timer = setTimeout(() => setArmed(null), ARMED_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  useEffect(() => {
    if (!onShowCard || !confirmShow) setArmed(null);
  }, [onShowCard, confirmShow]);

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
    //
    // A ghost at a fifteenth is a reminder to you and a legible pair of cards
    // to whoever is standing behind you, so anybody who asked for their hand to
    // be covered gets it covered here too: gone entirely until they point at
    // it. Folding is not the moment to start showing a hand to the room.
    if (!isMe) return null;
    const ghost = raised.size
      ? ""
      : hideUntilHover
        ? "opacity-0 hover:opacity-100 active:opacity-100 cursor-pointer"
        : "opacity-15 hover:opacity-100";
    return (
      <div
        title={raised.size
          ? "Shown to the table"
          : hideUntilHover ? "Hold to see the hand you mucked" : "Your mucked hand"}
        className={`flex gap-0.5 transition-opacity duration-200 ${ghost}`}
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
  const face = (card, index) => (
    <PlayingCard
      key={index}
      card={card}
      size={size}
      winning={winners.has(card)}
      shine={shine}
      className={lift(card)}
    />
  );
  // Between hands, your own cards are the button for showing them. The bar in
  // the action panel could do it before and still can, but a player reaching to
  // turn one over reaches for the card, not for a row of labels somewhere else
  // on the screen. One card at a time, which is the move worth making — both at
  // once is what the bar's "Both" is for.
  // Between hands a click shows the card. While the hand is live it asks
  // first — the second click on the same card is the one that turns it over.
  const press = (index) => {
    if (!confirmShow) return onShowCard(index);
    if (armed !== index) return setArmed(index);
    setArmed(null);
    return onShowCard(index);
  };
  const faces = (
    <>
      {cards.map((card, index) => (onShowCard ? (
        <button
          key={index}
          type="button"
          onClick={(event) => { event.stopPropagation(); press(index); }}
          title={armed === index
            ? `Click again to show ${card} to the table`
            : confirmShow ? `Show ${card} — asks first` : `Show ${card} to the table`}
          aria-label={armed === index
            ? `Confirm showing ${card} to the table`
            : `Show ${card} to the table`}
          className={`relative rounded transition-transform cursor-pointer
                      focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--color-highlight)
                      ${armed === index ? "-translate-y-[18%]" : "hover:-translate-y-[12%]"}`}
        >
          {face(card, index)}
          {armed === index && (
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-1 rounded-full whitespace-nowrap
                             bg-(--color-highlight) text-(--color-highlight-ink)
                             text-[8px] font-extrabold leading-tight shadow shadow-black/60">
              Show?
            </span>
          )}
        </button>
      ) : face(card, index)))}
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
        title={onShowCard ? "Hold to see your hand, click a card to show it" : "Hold to see your hand"}>
        <div className="flex gap-0.5 opacity-0 transition-opacity duration-150
                        group-hover/cards:opacity-100 group-active/cards:opacity-100">
          {faces}
        </div>
        <div aria-hidden="true"
          // Transparent to the pointer: it fades out under your cursor but it
          // is still lying there, and it was catching the click meant for the
          // card underneath. The hover target is the box around both.
          className="pointer-events-none absolute inset-0 flex gap-0.5 transition-opacity duration-150
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
