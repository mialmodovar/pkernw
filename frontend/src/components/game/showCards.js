/**
 * Showing what you had, once the hand is over.
 *
 * Asked from two places — the bar in the action panel and the cards themselves
 * — so the question of whether you may show is answered once. Two copies of
 * these conditions would eventually disagree, and the disagreement would be a
 * button that does nothing.
 *
 * Two separate questions live here, and keeping them apart is the whole point:
 * WHEN you may pick the cards, which is any time you are holding them, and WHEN
 * the table gets to see them, which is only after the hand is over. A player
 * reaches for their cards on the way to mucking them — that is the gesture, and
 * it stays — but a card that went face up at that moment would be telling
 * everybody still deciding something they have not paid to know.
 */

import { useEffect } from "react";

import { send } from "../../api/socket";
import useGameStore from "../../store/gameStore";

/**
 * What to do with a pick that was made while the hand was running.
 *
 * `stored` is what the store is holding, `hand` the two cards in front of you
 * now, and `mine` whether this copy of the question is being asked by the seat
 * that holds them. Four answers: "idle" for anybody else's seat, "stale" for a
 * pick about a hand that is gone, "wait" while the hand it belongs to is still
 * running, and "send" once it is over. Pulled out of the effect below because
 * it is the whole of the rule — a card shown late is a card shown, and a card
 * shown early is a card shown to people who are still deciding.
 *
 * `mine` is the one that was missing, and it is why picking a card to show did
 * nothing. Every seat on the table runs this hook — the offer has to be asked
 * once, for the seat that owns the cards — and a seat that is not yours holds
 * no cards, so the pick never matched the empty hand in front of it and every
 * one of them threw it away as stale. Eight seats deciding what to do with the
 * hero's pick meant seven votes to discard it, cast the instant it was made.
 */
export function resolvePending({ stored, hand, betweenHands, canShow, mine = true }) {
  // Not this seat's business. Not even to tidy up: the only seat that may
  // throw a pick away is the one that could have made it.
  if (!mine) return "idle";
  if (!stored) return "stale";
  // Not about this hand any more: either the deal moved on or the cards did.
  if (stored.cards !== hand) return "stale";
  if (!betweenHands) return "wait";
  // The window is open but there is nothing left to show — a showdown or a
  // runout got there first, or this seat has already shown once.
  if (!canShow) return "stale";
  return "send";
}

/**
 * What is pending after pressing card `index`, given what is pending now.
 *
 * Toggle, and an empty answer means "nothing" rather than "show no cards": a
 * pick taken back has to be indistinguishable from never having been made.
 *
 * Here rather than in the component because it is the rule that makes a single
 * press enough — see the note on `show` below.
 */
export function nextPending(current, index) {
  const held = new Set(current || []);
  if (held.has(index)) held.delete(index);
  else held.add(index);
  return [...held].sort();
}

/**
 * Whether this seat can still show, and how.
 *
 * `mySeat` is your seat number and `myCards` the two you were dealt. Returns
 * `canShow` and a `show(indices)` that names the cards by position, which is
 * what the server expects — sent now if the hand is over, held until it is if
 * not. `pending` is the pick that is waiting, so what you asked for is on
 * screen for the whole wait rather than being a click you have to remember, and
 * `cancel()` takes it back.
 */
export function useShowCardsOffer(mySeat, myCards) {
  // Whether the hand is over and the table is waiting. Not what decides whether
  // you may pick — see above — but what decides when the server is told, and
  // whether the bar in the action panel is up at all. A "show my cards" button
  // beside Fold, mid-decision, is a misclick waiting to happen; your own cards,
  // which take a second press to actually turn over, are not.
  const betweenHands = useGameStore((s) => s.showCardsOpen);
  // Once per hand, the same cap the server keeps. Without this the cards stay
  // clickable after you have shown one and the second click quietly does
  // nothing.
  const alreadyShown = useGameStore((s) => (
    mySeat == null ? false : Boolean(s.shownCards?.[mySeat]?.length)
  ));
  // Nothing to offer once your cards are already face up. That covers all three
  // ways it happens — a showdown, an all-in runout, or having just shown them
  // yourself — because each of those puts the cards on your own seat, and a
  // seat with cards on it is a hand everybody can already see.
  //
  // Reading the seat rather than remembering the click also means the offer
  // goes when the server confirms, not when the button is pressed.
  const alreadyPublic = useGameStore((s) => (
    mySeat == null ? false : Boolean(s.players.find((p) => p.seat === mySeat)?.cards?.length)
  ));
  // An all-in runout turns every hand in it face up before the board is even
  // out — going all in preflop means the table has been looking at your cards
  // for three streets. Checked separately from the seat above so that holds
  // even if a seat is missing from a reading.
  const runoutRevealed = useGameStore((s) => Boolean(s.allInEquity?.length));

  const stored = useGameStore((s) => s.pendingShow);
  const setPending = useGameStore((s) => s.setPendingShow);

  const cards = myCards || [];
  // The hand a pick belongs to. A pick is only ever about the two cards in
  // front of you, and holding it against them is what stops one made a moment
  // before the deal from turning over whatever arrives next.
  const hand = cards.join(",");
  const canShow = Boolean(
    cards.length > 0 && !alreadyShown && !alreadyPublic && !runoutRevealed,
  );
  const pending = stored && stored.cards === hand ? stored.indices : null;

  // The hand is over: whatever was asked for on the way to folding goes now.
  // Cleared before it is sent, so the two components that ask this question
  // cannot both send it — and so a refusal does not leave the pick sitting
  // there looking like it is still coming.
  // Whether this is the seat holding the cards. PlayerSeat asks for every seat
  // on the table and hands nulls in for everybody but you.
  const mine = mySeat != null;

  useEffect(() => {
    const step = resolvePending({ stored, hand, betweenHands, canShow, mine });
    if (step === "wait" || step === "idle") return;
    if (step === "stale") {
      if (stored) setPending(null);
      return;
    }
    setPending(null);
    send({ type: "show_cards", cards: stored.indices });
  }, [stored, hand, betweenHands, canShow, mine, setPending]);

  return {
    canShow,
    betweenHands,
    pending,
    cancel: () => setPending(null),
    show: (indices) => {
      if (!canShow) return;
      // Nothing asked for is nothing pending. Sending an empty list would ask
      // the server to show no cards, which it refuses — and would leave a
      // cancelled pick looking like one still on its way.
      if (!indices || indices.length === 0) {
        setPending(null);
        return;
      }
      // Mid-hand this is a request, not a reveal. The effect above posts it the
      // moment the hand ends — the same message the bar sends, through the same
      // server check, just later.
      if (!betweenHands) {
        setPending({ cards: hand, indices });
        return;
      }
      send({ type: "show_cards", cards: indices });
    },
  };
}
