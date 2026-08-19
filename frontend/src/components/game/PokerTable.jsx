import { useLayoutEffect, useRef, useState } from "react";

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
import ChipFlight from "./ChipFlight";
import PositionMarker from "./PositionMarker";
import positionLabels from "./tablePositions";
import { formatChips } from "./formatChips";
import handShines, { shiningBoardCards } from "./handShine";
import useEquityQuake from "./useEquityQuake";
import { backersOf } from "./sideBets";
import FinisherOverlay from "./FinisherOverlay";
import ThrownItem from "./ThrownItem";
import AimOverlay from "./AimOverlay";


// Seats sit on the felt ellipse. Slots are laid out from the table's CAPACITY,
// not from the number of players present, so nobody's seat shifts when
// someone busts.
// Kept short of the container edges so a seat's full card/marker/nameplate
// stack still fits inside the table area instead of being covered by the
// action panel below.
//
// `power` bends the ellipse towards a stadium: below 1 it pushes slots off the
// arc and onto the long sides, which is what makes a tall phone table read as a
// poker table instead of a ring of nameplates.
const PORTRAIT = { radiusX: 35, radiusY: 36, power: 0.7 };

// Three-handed, on a table built for three. The house oval seats eight, and
// three players sitting round it are three people at opposite ends of an empty
// room — so a Spin n Go gets its own smaller, rounder felt with the seats pulled
// in. Combined with the violet felt and the gold rim in index.css, the format is
// recognisable from the shape of the table before anything is dealt.
const SPIN_PORTRAIT = { radiusX: 30, radiusY: 30, power: 0.85 };
const SPIN_LANDSCAPE = { radiusX: 32, radiusY: 33, power: 1 };
const SPIN_FELT_INSET = {
  compact: "inset-x-[16%] inset-y-[13%] rounded-[46%/32%]",
  wide: "inset-x-[24%] inset-y-[16%] rounded-[50%]",
};

// The shape a 5:3 table has always had, and the point at which the ring starts
// needing help.
const CLASSIC_ASPECT = 5 / 3;

/** The seat ring for a table of a given width-to-height ratio.
 *
 * The frame is no longer a fixed 900×540: it fills the room it is given, so on
 * a wide window the felt is a long oval. Sampling an ellipse at equal angles
 * crowds the slots towards the two ends of its long axis, which on a stretched
 * table means clusters at the far left and right with nobody along the near and
 * far rails. The same bend the phone layout uses fixes it — pushed a little
 * harder the wider the table gets — and at the classic ratio nothing bends at
 * all, so an ordinary window looks exactly as it did.
 */
function landscapeGeometry(aspect) {
  const stretch = Math.max(0, aspect - CLASSIC_ASPECT);
  return { radiusX: 42, radiusY: 38, power: Math.max(0.72, 1 - stretch * 0.28) };
}

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

function bend(value, power) {
  return power === 1 ? value : Math.sign(value) * Math.abs(value) ** power;
}

function pointAt(index, capacity, scale, geometry) {
  const angle = (index / capacity) * 2 * Math.PI;
  const { radiusX, radiusY, power } = geometry;
  return {
    left: `${50 - radiusX * scale * bend(Math.sin(angle), power)}%`,
    top: `${50 + radiusY * scale * bend(Math.cos(angle), power)}%`,
  };
}

function slotPosition(index, capacity, geometry) {
  if (capacity <= 0) return { top: "50%", left: "50%" };
  // index 0 sits bottom-centre; the rest run around the table towards the left.
  return pointAt(index, capacity, 1, geometry);
}

// How far in from a seat its chips sit, as a share of the table's height, so
// it is the same distance whichever way the seat lies.
const BET_INSET = 26;

// The chip pill's own half-height, plus air between it and the seat. Generous
// on purpose: this is the number that decides whether a stack sits in front of
// a player or on their cards, and the felt between the seats and the pot is
// empty anyway.
const BET_MARGIN = 40;

/**
 * Half the room a seat takes up, in pixels, along each axis.
 *
 * A seat is not its face: it is a box of cards, a nameplate and a picture, and
 * PlayerSeat centres all of that on the point the ring puts it at. Clearing
 * only the avatar left the chips of a seat on the side sitting on its cards —
 * the box is up to 240px wide and the face is 100px of that.
 *
 * These mirror the clamps in PlayerSeat and PlayingCard. They are estimates of
 * somebody else's CSS, so they are deliberately generous: the cost of being a
 * little too clear is a chip stack sitting slightly further in, and the cost of
 * being a little short is what this is fixing.
 */
function seatHalfSpanPx(frameWidth) {
  const width = frameWidth || 0;
  // w-[clamp(8.75rem,27cqw,15rem)]
  const box = Math.min(240, Math.max(140, 0.27 * width));
  // The cards beside the face — h-[clamp(2.14rem,7.04cqw,4.69rem)] — over the
  // nameplate under it.
  const cards = Math.min(75, Math.max(34, 0.0704 * width));
  return { x: box / 2, y: (cards + 46) / 2 };
}

/**
 * Where a player's bet goes: just in front of them, on the felt.
 *
 * Not a fraction of the way to the middle, which is what this used to be. The
 * table is an ellipse and it is wider than it is tall, so scaling the radius
 * put the chips of a seat on the side nearly twice as far from their owner as
 * the chips of a seat at the top — they ended up adrift between the player and
 * the pot, and whose bet they were stopped being obvious.
 *
 * The step is taken in a space where one unit is the same distance on screen
 * both ways, since a percentage of the width and a percentage of the height
 * are not the same thing on a table this shape.
 */
function betPosition(index, capacity, geometry, frame) {
  if (capacity <= 0) return { top: "50%", left: "50%" };

  const seat = pointAt(index, capacity, 1, geometry);
  const wide = Number.isFinite(frame?.aspect) && frame.aspect > 0 ? frame.aspect : 1;
  const x = (parseFloat(seat.left) - 50) * wide;
  const y = parseFloat(seat.top) - 50;

  const reach = Math.hypot(x, y);
  if (!reach) return { top: "50%", left: "50%" };

  // Whichever is further: the share of the table, or enough pixels to clear
  // the seat itself. Which of the two wins depends on the seat — a player on
  // the side has a much wider box between them and the pot than one at the
  // top, and the step has to be measured along the way it is travelling.
  const half = seatHalfSpanPx(frame?.width);
  const reachOut = (Math.abs(x / reach) * half.x + Math.abs(y / reach) * half.y) + BET_MARGIN;
  const clearance = frame?.height ? (reachOut / frame.height) * 100 : 0;
  // Never past the middle, however small the table gets.
  const step = Math.min(Math.max(BET_INSET, clearance), reach * 0.55);

  return {
    left: `${50 + (x - (x / reach) * step) / wide}%`,
    top: `${50 + (y - (y / reach) * step)}%`,
    // Which way the pot lies, horizontally, so the chips can be hung off the
    // point rather than centred on it. The row of markers and the amount is
    // wide and short: centred, its far end reaches back over the face of the
    // player it belongs to, which is what put "BB 1.0 BB" on somebody's
    // avatar even once the point itself was clear.
    towardsPot: x / reach,
  };
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
  // A Spin n Go's drawn prize, and the reason this table does not look like the
  // other one. Null everywhere else.
  const spin = useGameStore((s) => s.spin);
  // The phone shape is fixed — the frame there is always the tall one — so only
  // the landscape ring is read off the measurement.
  const geometry = spin
    ? (compact ? SPIN_PORTRAIT : SPIN_LANDSCAPE)
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
      {/* Felt. A Spin n Go's is smaller, rounder and violet — see SPIN_PORTRAIT
          above and .felt-spin in index.css. */}
      <div className={`felt absolute ${spin ? "felt-spin" : ""} ${
        spin
          ? (compact ? SPIN_FELT_INSET.compact : SPIN_FELT_INSET.wide)
          : (compact ? "inset-x-[10%] inset-y-[7%] rounded-[46%/26%]" : "inset-x-[9%] inset-y-[19%] rounded-[50%]")
      }`} />

      {/* What is being played for, written on the felt. A Spin n Go's prize is
          not derivable from the buy-in the way a tournament's is — it was drawn
          — so it is worth having in front of the players the whole way through
          rather than only in the reveal that opens the game. */}
      {spin && <SpinPrizePlaque spin={spin} compact={compact} />}

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
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
        <CommunityCards winningCards={winningBoardCards} shiningCards={shiningBoard} />
        <PotDisplay />
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
                handStrength={isMe ? handStrength : null}
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
        const pos = betPosition(visualIdx, slots, geometry, frameSize);
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


/** The drawn prize, printed on the felt above the board.

 *  Deliberately quiet — it sits on the felt for the whole game, so it is a
 *  plaque rather than a banner. The reveal is SpinReveal's job.
 */
function SpinPrizePlaque({ spin, compact }) {
  if (!spin?.prize_coins) return null;
  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 z-10 pointer-events-none
                  flex items-center gap-2 rounded-full border
                  border-[rgb(var(--highlight-rgb)/0.45)]
                  bg-[rgba(12,7,18,0.72)] px-3 py-1
                  ${compact ? "top-[16%] text-[11px]" : "top-[24%] text-xs"}`}
      title={`${spin.stake_coins} coins × ${spin.multiplier}, winner takes all`}
    >
      <span className="font-semibold text-(--color-highlight-text) tabular-nums">
        {"\u{1FA99}"} {spin.prize_coins.toLocaleString()}
      </span>
      <span className="text-(--color-text-muted)">·</span>
      <span className="font-semibold text-(--color-highlight-text) tabular-nums">
        {spin.multiplier}×
      </span>
    </div>
  );
}
