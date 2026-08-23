import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { send } from "../../api/socket";
import useGameStore from "../../store/gameStore";
import PlayerSeat from "./PlayerSeat";
import CommunityCards from "./CommunityCards";
import PotDisplay from "./PotDisplay";
import { timerToneVar, useActionCountdown } from "./useActionCountdown";
import {
  faceUpFromRunout,
  holdFaceDown,
  resultIsRevealed,
  useShowdownReveal,
} from "./useShowdownReveal";
import { useCompactLayout } from "./useCompactLayout";
import ChipStack from "./ChipStack";
import HitEffect from "./HitEffect";
import ChipFlight from "./ChipFlight";
import PositionMarker from "./PositionMarker";
import positionLabels from "./tablePositions";
import {
  CLASSIC_ASPECT,
  FELT_PLAQUE,
  PORTRAIT,
  SHORT_TABLES,
  landscapeGeometry,
  pointAt,
  slotPosition,
} from "./tableSeats";
import { betPosition } from "./betSpots";
import { formatChips } from "./formatChips";
import handShines, { shiningBoardCards } from "./handShine";
import useEquityQuake from "./useEquityQuake";
import { backersOf } from "./sideBets";
import FinisherOverlay from "./FinisherOverlay";
import MysteryBoard from "./MysteryBoard";
import MysteryOpening from "./MysteryOpening";
import MysteryReveal from "./MysteryReveal";
import ThrownItem, { FLIGHT_MS } from "./ThrownItem";
import AimOverlay from "./AimOverlay";


/** How big the frame currently is, measured rather than assumed: it is CSS
 *  that decides, from the space left over by everything above and below the
 *  table. The shape drives the seat ring; the size is what tells the chips how
 *  far they have to sit from a face that does not shrink with the table. */
function useFrameSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0, aspect: CLASSIC_ASPECT });

  useLayoutEffect(() => {
    const frame = ref.current;
    if (!frame || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height, aspect: width / height });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function EmptySeat() {
  return (
    // The same width a taken seat occupies, so the ring of seats does not
    // change shape as players come and go.
    <div className="w-[clamp(8.75rem,27cqw,15rem)] rounded-lg px-3 py-2 text-center
                    border border-dashed border-(--color-border) bg-black/25">
      <div className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">Empty</div>
    </div>
  );
}

export default function PokerTable({ mySeat, capacity, statsByName, onInspectPlayer }) {
  const {
    players, actionOnSeat, holeCards, communityCards, winnerSeats, potAwards, allInEquity,
    dealerSeat, sbSeat, bbSeat, showdown, handStrength, shownCards, sideBets,
    chipsInFlight, chipFlightId, chipFlightKind,
  } = useGameStore();
  const showBB = useGameStore((s) => s.showBB);
  // Who is currently saying something. A seat is its own stacking context — it
  // is positioned and translated — so a bubble inside one cannot be lifted over
  // the seat next door by any z-index of its own; the seat has to be lifted.
  const seatBubbles = useGameStore((s) => s.seatBubbles);
  const seatPanelOpen = useGameStore((s) => s.seatPanelOpen);
  const bb = useGameStore((s) => s.level?.big_blind) || 0;
  const countdown = useActionCountdown();
  const revealedSeats = useShowdownReveal(showdown);
  const compact = useCompactLayout();
  // The whole table takes the hit, so the board, the seats and the chips move
  // together — shaking one of them would read as a glitch in that element.
  const quake = useEquityQuake();
  const frame = useRef(null);
  // Aiming: an item picked and waiting for a target. While it is set, a click
  // on somebody else's seat throws instead of opening their stats.
  const aimingItem = useGameStore((s) => s.aimingItem);
  const setAiming = useGameStore((s) => s.setAiming);
  const throws = useGameStore((s) => s.throws);
  const frameSize = useFrameSize(frame);
  const aspect = frameSize.aspect;
  // Which instant format this is, if it is one at all. Null at a tournament,
  // which is what leaves this looking like a tournament's table.
  const fast = useGameStore((s) => s.fast);
  // The felt is laid for the seats the format has rather than the players who
  // have connected: half of them may still be loading, and a table that changes
  // shape as people arrive is worse than one that starts the right size.
  const shortTable = SHORT_TABLES[fast?.seats] || null;
  // The phone shape is fixed — the frame there is always the tall one — so only
  // the landscape ring is read off the measurement.
  const geometry = shortTable
    ? (compact ? shortTable.portrait : shortTable.landscape)
    : (compact ? PORTRAIT : landscapeGeometry(aspect));

  // Winners are known from pot_awarded; their best five get the gold ring, and
  // the losing hands dim so the eye goes to what actually won.
  const showdownBySeat = new Map((showdown || []).map((entry) => [entry.seat, entry]));
  // Hands an all-in runout already turned over. The showdown stagger must not
  // touch them: flipping a visible hand back down and showing it again is what
  // made the losing hand blink on the river.
  const faceUpSeats = faceUpFromRunout(allInEquity);
  // Hold the result back until every hand has turned over — otherwise the
  // winner banner and the gold rings give it away mid-reveal.
  const resultRevealed = resultIsRevealed({ showdown, revealedSeats, faceUpSeats });
  // Your own read on what you hold, for the line under the board. Only while
  // the hand is still yours to play: at showdown every hand is named on its own
  // seat, and a folded player holds nothing worth naming.
  //
  // Covering your cards covers this too. It is the same secret said twice, and
  // a table that hides the cards while printing "Two pair, aces and kings" in
  // the middle of the felt has hidden nothing from anybody standing behind you.
  const hideHand = useGameStore((s) => s.hideHand);
  const mine = players.find((p) => p.seat === mySeat) || null;
  const myHandRead = handStrength && mine && !mine.is_folded && !showdown && !hideHand
    ? handStrength
    : null;

  // Throws that were aimed at this player, held back until they land. The
  // store knows a throw exists the moment it is broadcast; the mess belongs to
  // the moment it arrives.
  const myUserId = players.find((p) => p.seat === mySeat)?.user_id ?? null;
  const [landedOnMe, setLandedOnMe] = useState([]);
  // The highest throw id already scheduled. Without it, every re-render while
  // one is in the air would queue the same landing again.
  const seenThrow = useRef(0);
  const clearHit = useCallback((id) => {
    setLandedOnMe((hits) => hits.filter((one) => one.id !== id));
  }, []);

  useEffect(() => {
    if (myUserId == null) return undefined;
    const mine = throws.filter((one) => one.toUserId === myUserId);
    if (!mine.length) return undefined;
    const timers = mine
      .filter((one) => one.id > seenThrow.current)
      .map((one) => {
        seenThrow.current = Math.max(seenThrow.current, one.id);
        return setTimeout(() => {
          setLandedOnMe((hits) => (hits.some((h) => h.id === one.id) ? hits : [...hits, one]));
        }, FLIGHT_MS);
      });
    return () => timers.forEach(clearTimeout);
  }, [throws, myUserId]);

  const winningBoardCards = resultRevealed
    ? winnerSeats.flatMap((seat) => showdownBySeat.get(seat)?.best_cards || [])
    : [];

  // Every other hand that is face up. In an all-in runout the cards are turned
  // over before the board finishes, so from that moment the table knows exactly
  // who is winning — and a shine that ignores it is telling somebody drawing
  // dead that their river was good news.
  const exposedHands = players
    .filter((p) => p.seat !== mySeat && !p.is_folded && p.cards?.length === 2)
    .map((p) => p.cards);

  // Your own good cards catch the light. Held back once the hands turn over,
  // where the gold ring on the winning five is the thing to look at.
  const heroShines = showdown == null && handShines(holeCards, communityCards, exposedHands);
  // A hand is five cards, not two. The board cards that make it up shine with
  // the hero's own, so what lights up is the hand rather than half of it.
  const shiningBoard = heroShines
    ? shiningBoardCards(holeCards, communityCards, exposedHands)
    : [];

  // Fall back to what the seat numbers imply until capacity is known.
  const highestSeat = players.length ? Math.max(...players.map((p) => p.seat)) + 1 : 0;
  const slots = Math.max(capacity || 0, highestSeat, players.length, 1);

  // Where a seat is, in pixels inside the frame. Null until the frame has been
  // measured, which is the first paint only.
  const seatPixel = (seat) => {
    if (seat == null || !frameSize.width || !frameSize.height) return null;
    const visual = (seat - (mySeat ?? 0) + slots) % slots;
    const point = slotPosition(visual, slots, geometry);
    return {
      x: (parseFloat(point.left) / 100) * frameSize.width,
      y: (parseFloat(point.top) / 100) * frameSize.height,
    };
  };

  // The middle of the felt, where the pot is. Collections end here and awards
  // start here.
  const centre = frameSize.width && frameSize.height
    ? { x: frameSize.width / 2, y: frameSize.height / 2 }
    : null;

  // Rotate slots so the hero's seat lands on the bottom-centre position.
  const offset = mySeat ?? 0;
  const bySeat = new Map(players.map((p) => [p.seat, p]));

  // What each seat's position is called this hand. Counted over the players
  // actually dealt in — somebody sitting out or waiting on a rebuy is not
  // between the button and the blinds, and counting them would move everyone
  // else's position by one.
  const positions = positionLabels(
    players
      .filter((p) => !p.is_eliminated && !p.is_sitting_out && !p.is_waiting)
      .map((p) => p.seat)
      .sort((a, b) => a - b),
    dealerSeat,
  );


  // Sized by .table-frame, and itself a size container so everything sitting on
  // the felt is measured against the felt rather than against the window.
  return (
    <div ref={frame} className={`@container table-frame relative mx-auto ${quake}`}>
      {/* Felt. Short-handed formats get a smaller one (see SHORT_TABLES above),
          and the Spin n Go gets the violet — .felt-spin in index.css. */}
      <div className={`felt absolute ${fast?.key === "spingo" ? "felt-spin" : ""} ${
        shortTable
          ? (compact ? shortTable.compact : shortTable.wide)
          : (compact ? "inset-x-[10%] inset-y-[7%] rounded-[46%/26%]" : "inset-x-[9%] inset-y-[19%] rounded-[50%]")
      }`} />

      {/* What is being played for, written on the felt. Worth having in front of
          the players the whole way through rather than only in the moment the
          game opens — a drawn prize is not derivable from the buy-in, and a coin
          prize is not something the chips on the table say. */}
      {fast && <FastPrizePlaque fast={fast} compact={compact} />}

      {/* Mystery bounties: what is left on the board all game, the envelope
          being opened, and — over everything — the moment the pool is cut. */}
      <MysteryBoard compact={compact} />
      <MysteryReveal />
      <MysteryOpening />

      {/* Everything currently in the air. Seat positions are percentages of
          the frame, and both the flight and the aiming need pixels, so they
          are converted once here against the measured frame. */}
      {throws.map((one) => (
        seatPixel(one.fromSeat) && seatPixel(one.toSeat) ? (
          <ThrownItem
            key={one.id}
            throwing={one}
            from={seatPixel(one.fromSeat)}
            to={seatPixel(one.toSeat)}
          />
        ) : null
      ))}

      {/* The ones aimed at you, on your own screen. The seat everybody else
          watched it land on is not where it landed for you. Delayed until the
          thing has actually crossed — see FLIGHT_MS — so the mess arrives with
          the object rather than ahead of it. */}
      {landedOnMe.map((one) => (
        <HitEffect key={one.id} hit={one} onDone={clearHit} />
      ))}

      {aimingItem && seatPixel(mySeat) && (
        <AimOverlay
          item={aimingItem}
          hero={seatPixel(mySeat)}
          targets={players
            .filter((one) => one.seat !== mySeat && one.user_id != null && !one.is_eliminated)
            .map((one) => ({ ...seatPixel(one.seat), seat: one.seat, userId: one.user_id, name: one.name }))
            .filter((one) => one.x != null)}
          onThrow={(target) => {
            send({ type: "throw_item", item: aimingItem, at_user_id: target.userId });
            setAiming(null);
          }}
          onCancel={() => setAiming(null)}
        />
      )}

      {/* A knockout GIF, over the middle of the table. Sits inside the frame
          so it covers the felt and not the whole page. */}
      <FinisherOverlay />

      {/* Money crossing the felt. Above the seats it passes and below the
          panels, so a stack on its way to the pot is never behind a nameplate. */}
      {chipsInFlight.length > 0 && (
        <ChipFlight
          entries={chipsInFlight}
          kind={chipFlightKind}
          flightId={chipFlightId}
          seatPixel={seatPixel}
          centre={centre}
        />
      )}

      {/* Community cards + pot */}
      {/* Tighter on a phone: the pot and the line naming your hand sit between
          the board and the seats above and below it, and eight points of air
          three times over is a row of cards' worth of felt. */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                       flex flex-col items-center ${compact ? "gap-1" : "gap-2"}`}>
        <CommunityCards winningCards={winningBoardCards} shiningCards={shiningBoard} />
        <PotDisplay />
        {/* What you have, under the board you have it with.
            It used to sit on your own seat, a few pixels from your name, your
            stack and the big blinds it is worth — which is the busiest corner
            of the felt and the one place a quiet line of text cannot be read.
            Here it is beside the cards it is talking about, and it belongs to
            nobody else's seat, so it can stay quiet. */}
        {myHandRead && (
          <span className="max-w-[14rem] truncate text-[11px] font-semibold tracking-wide
                           text-(--color-highlight-text)/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {myHandRead}
          </span>
        )}
        {allInEquity?.length > 0 && (
          <span className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-(--color-highlight-text) animate-pulse">
            All in
          </span>
        )}
      </div>

      {/* Seats — one per slot, occupied or not */}
      {Array.from({ length: slots }, (_, visualIdx) => {
        const seat = (offset + visualIdx) % slots;
        const p = bySeat.get(seat);
        const pos = slotPosition(visualIdx, slots, geometry);
        const isMe = p != null && p.seat === mySeat;
        const isActive = p != null && actionOnSeat === p.seat;
        return (
          <div key={seat}
            // Over its neighbours, and over the bets on the felt, for as long
            // as it is holding a bubble — a speech balloon half behind the next
            // player's nameplate reads as a rendering fault. The same for your
            // own seat with a quick panel open beside it: the panel hangs out
            // to the side, straight into whoever is sitting there.
            className={`absolute -translate-x-1/2 -translate-y-1/2 ${
              (p && seatBubbles[p.user_id]) || (isMe && seatPanelOpen) ? "z-30" : ""
            }`}
            style={{ top: pos.top, left: pos.left }}>
            {p ? (
              <PlayerSeat
                player={p}
                isMe={isMe}
                isActive={isActive}
                myCards={isMe ? holeCards : null}
                isWinner={resultRevealed && winnerSeats.includes(p.seat)}
                winAmount={potAwards?.filter((a) => a.seat === p.seat).reduce((s, a) => s + (a.amount || 0), 0) || 0}
                equity={allInEquity?.find((e) => e.seat === p.seat)?.equity ?? null}
                // What this seat is drawing to, when it is behind. Only your
                // own is drawn — the felt has no room for nine of these, and
                // it is your own draw you are counting.
                outs={isMe ? (allInEquity?.find((e) => e.seat === p.seat)?.outs ?? null) : null}
                showdownEntry={showdownBySeat.get(p.seat)}
                faceDownAtShowdown={holdFaceDown({
                  seat: p.seat, revealedSeats, faceUpSeats, isMe,
                })}
                dimmed={resultRevealed && winnerSeats.length > 0 && showdown != null && !winnerSeats.includes(p.seat)}
                // The button and the blinds are marked on the felt beside the
                // chips they cost; what the seat itself carries is the name of
                // the position, which every player in the hand has.
                position={positions.get(p.seat) || null}
                timerPct={isActive ? countdown.pct : 100}
                timerTone={isActive ? timerToneVar(countdown) : undefined}
                topHalf={parseFloat(pos.top) < 50}
                // Keyed on the login name, never on the one they can change.
                stats={statsByName?.[p.username]}
                onInspect={onInspectPlayer ? () => onInspectPlayer(p) : undefined}
                backers={backersOf(sideBets, p.seat)}
                shine={isMe && heroShines && !p.is_folded}
                // Only your own: the lift is there to tell you what you just
                // put on display, and every other seat's cards are already
                // face up by the time they are on the felt at all.
                raisedCards={isMe ? shownCards[p.seat] : null}
                compact={compact}
              />
            ) : (
              <EmptySeat />
            )}
          </div>
        );
      })}

      {/* Bets, on the line between each seat and the pot — and, right beside
          them, the button and the blind markers. Those three belong with the
          chips rather than with the nameplates: the blinds ARE the chips in
          front of those two seats, and the button is read against them. */}
      {Array.from({ length: slots }, (_, visualIdx) => {
        const seat = (offset + visualIdx) % slots;
        const p = bySeat.get(seat);
        if (!p) return null;
        const isDealer = dealerSeat === p.seat;
        const isSB = sbSeat === p.seat;
        const isBB = bbSeat === p.seat;
        if (!p.bet && !isDealer && !isSB && !isBB) return null;
        const pos = betPosition(visualIdx, slots, geometry, frameSize, pointAt, compact);
        return (
          <div key={`bet-${seat}`}
            className="absolute z-10 flex items-center gap-0.5 whitespace-nowrap"
            style={{
              top: pos.top,
              left: pos.left,
              // Centred for a seat at the top or bottom, where there is nothing
              // to the side of it; hung off the point for a seat on the side,
              // so it always grows towards the pot and never back over its
              // owner. A seat directly above or below lands at -50%, which is
              // where it always was.
              transform: `translate(${-50 + 50 * (pos.towardsPot ?? 0)}%, -50%)`,
            }}>
            <PositionMarker isDealer={isDealer} isSB={isSB} isBB={isBB} />
            {p.bet > 0 && (
              <span
                key={`${p.seat}-${p.is_all_in ? "allin" : "bet"}`}
                // Which way its owner is: the pill is hung towards the pot, so
                // the chips push in from behind it. A seat at the top or bottom
                // has no sideways component and simply comes up off the felt.
                style={{ "--push-x": `${-(pos.towardsPot ?? 0) * 10}px` }}
                className={`flex items-center gap-0.5 px-1 py-0.5 rounded-full bg-black/70
                            border border-(--color-highlight-edge) shadow-lg shadow-black/60 ${
                              p.is_all_in ? "animate-chip-shove" : "animate-chip-in"
                            }`}>
                <ChipStack amount={p.bet} size={9} />
                <span className="text-[12px] font-bold text-(--color-highlight-text) leading-none">
                  {formatChips(p.bet, showBB, bb)}
                </span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}


/** The prize, printed on the felt.
 *
 *  Deliberately quiet — it sits there for the whole game, so it is a plaque
 *  rather than a banner. The moment a draw lands is SpinReveal's job.
 *
 *  In the corner rather than above the board. Centred at the top is where it
 *  was, and heads-up that is precisely where the other player sits: the prize
 *  landed on their nameplate and, once seats started saying what they had just
 *  done, on top of that too. FELT_PLAQUE is the corner, and a test keeps every
 *  seat of every table shape away from it.
 */
function FastPrizePlaque({ fast, compact }) {
  if (!fast?.prize_coins) return null;
  const title = fast.multiplier
    ? `${fast.stake_coins} coins × ${fast.multiplier}, winner takes all`
    : `${fast.label} · ${fast.stake_coins} coins a seat`;
  return (
    <div
      style={{ left: `${FELT_PLAQUE.left}%`, top: `${FELT_PLAQUE.top}%` }}
      className={`absolute z-10 pointer-events-none
                  flex items-center gap-2 rounded-full border
                  border-[rgb(var(--highlight-rgb)/0.45)]
                  bg-[rgba(12,7,18,0.72)] px-3 py-1
                  ${compact ? "text-[11px]" : "text-xs"}`}
      title={title}
    >
      <span className="font-semibold text-(--color-highlight-text) tabular-nums">
        {"\u{1FA99}"} {fast.prize_coins.toLocaleString()}
      </span>
      {/* The multiplier is the whole story of a Spin n Go and does not exist
          anywhere else, so it is the one thing that earns a second line here. */}
      {fast.multiplier > 0 && (
        <>
          <span className="text-(--color-text-muted)">·</span>
          <span className="font-semibold text-(--color-highlight-text) tabular-nums">
            {fast.multiplier}×
          </span>
        </>
      )}
    </div>
  );
}
