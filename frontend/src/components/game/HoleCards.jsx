import { useEffect, useState } from "react";

import { highToLow } from "./cardOrder";
import PlayingCard, { CardBack } from "./PlayingCard";
import { nextPending } from "./showCards";

/** How long a selection waits before it forgets it was made. On a phone the
 *  gesture for peeking at your own hand is a tap, and a tap that leaves "Show"
 *  sitting over your cards until you deal with it is a trap. */
const PICKED_MS = 6000;

/** How long the hand sits as it was dealt before it tidies itself. Long enough
 *  to see it arrive that way, short enough that you are not reading a hand
 *  backwards while deciding what to do with it. */
const TIDY_MS = 550;

export default function HoleCards({
  cards, folded, eliminated, isMe, winningCards, raisedCards, faceDown, shine,
  hideUntilHover = false, size = "seat", onShowCards = null,
  showDeferred = false, pendingShow = null, onCancelShow = null,
}) {
  // Which cards have been picked but not yet asked about. Nothing reaches this
  // any more — a press asks — and it is kept because the bar in the action
  // panel still sends a pair at once, and because a card can be picked while
  // there is nobody to offer it to.
  const [picked, setPicked] = useState([]);

  useEffect(() => {
    if (!picked.length) return undefined;
    const timer = setTimeout(() => setPicked([]), PICKED_MS);
    return () => clearTimeout(timer);
  }, [picked]);

  useEffect(() => {
    if (!onShowCards) setPicked([]);
  }, [onShowCards]);

  // A pick that has been sent stops being a pick: the cards are either up or the
  // wait is on, and leaving them picked would offer to show what is already on
  // its way.
  const asked = (pendingShow || []).join(",");
  useEffect(() => {
    if (asked) setPicked([]);
  }, [asked]);

  // A hand arrives in the order it was dealt and then shuffles itself big-card
  // first, which is what every player does by hand the moment they look. Held
  // for a beat so the tidy is something you watch happen rather than a pair
  // that was mysteriously never in the order it was dealt.
  const dealt = (cards || []).join(",");
  const [tidy, setTidy] = useState(false);
  useEffect(() => {
    setTidy(false);
    if (!dealt) return undefined;
    const timer = setTimeout(() => setTidy(true), TIDY_MS);
    return () => clearTimeout(timer);
  }, [dealt]);

  if (eliminated) return null;

  // Your own cards are how you show them. The bar in the action panel could do
  // it before and still can, but a player reaching to turn one over reaches for
  // the card, not for a row of labels somewhere else on the screen. Pick either
  // or both — showing one is a real move and so is showing the pair.
  // A pick that is waiting for the hand to end. It stands the cards up the same
  // way picking them does, so what you asked for is on the felt in front of you
  // for the whole wait rather than being a click you have to remember making.
  const waiting = new Set(pendingShow || []);
  const toggle = (index) => {
    // While the hand is live, pressing a card *is* the request. It used to only
    // pick the card up, and asking took a second press on a small pill above
    // it — which is the step everybody missed, and the pick then expired six
    // seconds later, so pressing your cards looked like it did nothing at all.
    //
    // Safe as one press precisely because it is deferred: nothing is revealed
    // until the hand is over and pressing again takes it back. The immediate
    // case below keeps its second press, because a card turned over now cannot
    // be un-turned.
    // One press, every time. It used to take two — pick the card, then press a
    // pill above it — and the second one is the step nobody finds. While the
    // hand is live nothing is revealed until it ends and pressing again takes
    // it back, so there is nothing to confirm; between hands the reveal is
    // immediate, which is a real cost, but it is the cost of showing your own
    // cards after a hand is over and it is what was asked for.
    if (onShowCards) {
      onShowCards(showDeferred ? nextPending([...waiting], index) : [index]);
      return;
    }
    setPicked((current) => (
      current.includes(index)
        ? current.filter((one) => one !== index)
        : [...current, index].sort()
    ));
  };
  const showPicked = () => {
    const wanted = [...picked];
    setPicked([]);
    onShowCards(wanted);
  };
  const chosen = (position) => picked.includes(position) || waiting.has(position);
  // The card, wrapped in the press that picks it. Used by a live hand and by a
  // mucked one alike: folding is exactly when a player reaches for their cards,
  // and taking the press away at that moment would take away the gesture this
  // is here for.
  const pickable = (position, card, inner) => (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); toggle(position); }}
      title={picked.includes(position)
        ? `${card} is picked — press Show, or click it again to put it back`
        : waiting.has(position)
          ? `${card} goes face up when the hand ends — click again to take it back`
          : showDeferred
            ? `Show ${card} when the hand ends`
            : `Show ${card} now`}
      aria-pressed={chosen(position)}
      aria-label={showDeferred ? `Show ${card} when the hand ends` : `Show ${card} now`}
      className={`block rounded transition-transform cursor-pointer
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--color-highlight)
                  ${chosen(position) ? "-translate-y-[18%]" : "hover:-translate-y-[12%]"}`}
    >
      {inner}
    </button>
  );

  // One button over the pair rather than a confirm on each card: showing both
  // is a single move — "here, look" — and asking for it twice would turn it
  // into two. Mid-hand it says what actually happens: the cards go up when the
  // hand is over, because a card turned over while people are still deciding
  // tells them something they have not paid to know.
  const showButton = onShowCards && picked.length > 0 && (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); showPicked(); }}
      title={`${picked.map((one) => cards[one]).join(" and ")} ${
        showDeferred ? "go face up when the hand ends" : "go face up now"}`}
      className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 px-1.5 py-0.5 rounded-full
                 whitespace-nowrap bg-(--color-highlight) text-(--color-highlight-ink)
                 text-[9px] font-extrabold leading-tight shadow shadow-black/60
                 hover:brightness-110 transition-[filter]"
    >
      {showDeferred
        ? "Show at the end"
        : `Show ${picked.length === 2 ? "both" : cards[picked[0]]}`}
    </button>
  );

  // Already asked, still waiting for the hand to finish. Sitting there as a
  // button rather than a label so it can be taken back: a hand flashed on the
  // way to folding is a decision made in a hurry, and there is no reason to make
  // it final before the cards are actually up.
  const waitingBadge = !showButton && waiting.size > 0 && (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); onCancelShow?.(); }}
      title="Waiting for the hand to end — click to take it back"
      className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 px-1.5 py-0.5 rounded-full
                 whitespace-nowrap bg-black/75 border border-(--color-highlight-edge)
                 text-(--color-highlight-pale) text-[9px] font-bold leading-tight
                 hover:border-(--color-highlight) transition-colors"
    >
      Showing at the end
    </button>
  );
  const overlay = showButton || waitingBadge || null;

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
    // A pick still standing keeps the hand legible to you — it is about to be
    // face up anyway — but not to anybody covering their hand: picking one of
    // two says nothing about the other, and lighting the pair up would hand the
    // room behind them the card they did not pick.
    const ghost = hideUntilHover
      ? (raised.size ? "" : "opacity-0 hover:opacity-100 active:opacity-100 cursor-pointer")
      : (raised.size || waiting.size || picked.length ? "" : "opacity-15 hover:opacity-100");
    return (
      // The badge outside the fade, the cards inside it: what you asked for has
      // to be readable even when the hand it is about is covered.
      <div className="relative">
        {/* Mucking is when a player reaches for their cards — to flash one on
            the way past. It is still a pick and not a reveal: the table sees it
            when the hand is over, never while somebody is still deciding. */}
        {overlay}
        <div
          title={raised.size
            ? "Shown to the table"
            : hideUntilHover ? "Hold to see the hand you mucked" : "Your mucked hand"}
          className={`flex gap-0.5 transition-opacity duration-200 ${ghost}`}
        >
          {(cards || []).length
            ? cards.map((card, index) => {
                const drawn = <PlayingCard card={card} size={size} className={lift(card)} />;
                return (
                  <span key={index}>
                    {onShowCards ? pickable(index, card, drawn) : drawn}
                  </span>
                );
              })
            : (<><CardBack size={size} /><CardBack size={size} /></>)}
        </div>
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
  // Where each card is drawn, which is not where it was dealt. `position` is
  // the dealt one all the way through — the server is told to show card 0, and
  // card 0 is the card the deck gave you first, whichever end of the pair it
  // has ended up at.
  // Somebody else's hand is turned over already in order — there is no moment
  // of it arriving for you to watch, and a pair that rearranged itself half a
  // second after a showdown would just look like a glitch. Only your own does
  // the arrive-then-tidy.
  const sorted = isMe ? tidy : true;
  const order = sorted ? highToLow(cards) : cards.map((_, index) => index);
  // Which way a card had to travel to get where it is now, for the slide. Only
  // your own hand does this: everybody else's arrives already in order, at
  // showdown, with nothing to watch.
  const swap = (place, position) => {
    if (!isMe || !tidy || place === position) return "";
    return place > position ? "animate-card-swap-right" : "animate-card-swap-left";
  };
  const faces = (
    <>
      {order.map((position, place) => {
        const card = cards[position];
        const inner = onShowCards
          ? pickable(position, card, face(card, position))
          : face(card, position);
        // Keyed on the card so the pair is moved rather than rebuilt when it
        // sorts itself — a rebuilt card would blink instead of sliding. The
        // deal comes first and the swap replaces it: changing which animation
        // is named is what makes the browser run the second one.
        const arriving = isMe && !tidy ? "animate-hole-card-deal" : swap(place, position);
        return (
          <span
            key={card}
            className={arriving}
            // Pitched from the middle of the table, the second a beat later.
            style={isMe && !tidy ? { animationDelay: `${place * 90}ms` } : undefined}
          >
            {inner}
          </span>
        );
      })}
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
        title={onShowCards ? "Hold to see your hand, click a card to pick it" : "Hold to see your hand"}>
        {overlay}
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
    <div className="relative flex gap-0.5">
      {overlay}
      {faces}
    </div>
  );
}
