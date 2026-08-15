import useGameStore from "../../store/gameStore";
import PlayerSeat from "./PlayerSeat";
import CommunityCards from "./CommunityCards";
import PotDisplay from "./PotDisplay";
import { timerToneClass, useActionCountdown } from "./useActionCountdown";
import { useShowdownReveal } from "./useShowdownReveal";
import { useCompactLayout } from "./useCompactLayout";
import ChipStack from "./ChipStack";
import { formatChips } from "./formatChips";
import handShines, { shiningBoardCards } from "./handShine";
import useEquityQuake from "./useEquityQuake";
import FinisherOverlay from "./FinisherOverlay";


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
const LANDSCAPE = { radiusX: 42, radiusY: 38, power: 1 };
const PORTRAIT = { radiusX: 35, radiusY: 36, power: 0.7 };

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

// Part way in from the seat towards the pot: on the felt, clear of the cards,
// and unambiguous about whose bet it is.
function betPosition(index, capacity, geometry) {
  if (capacity <= 0) return { top: "50%", left: "50%" };
  return pointAt(index, capacity, 0.46, geometry);
}

function EmptySeat() {
  return (
    <div className="w-[clamp(4.75rem,15cqw,8.5rem)] rounded-lg px-3 py-2 text-center
                    border border-dashed border-(--color-border) bg-black/25">
      <div className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">Empty</div>
    </div>
  );
}

export default function PokerTable({ mySeat, capacity, statsByName, onInspectPlayer }) {
  const {
    players, actionOnSeat, holeCards, communityCards, winnerSeats, potAwards, allInEquity,
    dealerSeat, sbSeat, bbSeat, showdown, handStrength,
  } = useGameStore();
  const showBB = useGameStore((s) => s.showBB);
  const bb = useGameStore((s) => s.level?.big_blind) || 0;
  const countdown = useActionCountdown();
  const revealedSeats = useShowdownReveal(showdown);
  const compact = useCompactLayout();
  // The whole table takes the hit, so the board, the seats and the chips move
  // together — shaking one of them would read as a glitch in that element.
  const quake = useEquityQuake();
  const geometry = compact ? PORTRAIT : LANDSCAPE;

  // Winners are known from pot_awarded; their best five get the gold ring, and
  // the losing hands dim so the eye goes to what actually won.
  const showdownBySeat = new Map((showdown || []).map((entry) => [entry.seat, entry]));
  // Hold the result back until every hand has turned over — otherwise the
  // winner banner and the gold rings give it away mid-reveal.
  const resultRevealed = revealedSeats == null || revealedSeats.size >= (showdown?.length ?? 0);
  const winningBoardCards = resultRevealed
    ? winnerSeats.flatMap((seat) => showdownBySeat.get(seat)?.best_cards || [])
    : [];

  // Your own good cards catch the light. Held back once the hands turn over,
  // where the gold ring on the winning five is the thing to look at.
  const heroShines = showdown == null && handShines(holeCards, communityCards);
  // A hand is five cards, not two. The board cards that make it up shine with
  // the hero's own, so what lights up is the hand rather than half of it.
  const shiningBoard = heroShines ? shiningBoardCards(holeCards, communityCards) : [];

  // Fall back to what the seat numbers imply until capacity is known.
  const highestSeat = players.length ? Math.max(...players.map((p) => p.seat)) + 1 : 0;
  const slots = Math.max(capacity || 0, highestSeat, players.length, 1);

  // Rotate slots so the hero's seat lands on the bottom-centre position.
  const offset = mySeat ?? 0;
  const bySeat = new Map(players.map((p) => [p.seat, p]));


  // Sized by .table-frame, and itself a size container so everything sitting on
  // the felt is measured against the felt rather than against the window.
  return (
    <div className={`@container table-frame relative mx-auto ${quake}`}>
      {/* Felt */}
      <div className={`felt absolute ${
        compact ? "inset-x-[10%] inset-y-[7%] rounded-[46%/26%]" : "inset-x-[9%] inset-y-[19%] rounded-[50%]"
      }`} />

      {/* A knockout GIF, over the middle of the table. Sits inside the frame
          so it covers the felt and not the whole page. */}
      <FinisherOverlay />

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
            className="absolute -translate-x-1/2 -translate-y-1/2"
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
                showdownEntry={showdownBySeat.get(p.seat)}
                faceDownAtShowdown={revealedSeats != null && !revealedSeats.has(p.seat) && !isMe}
                dimmed={resultRevealed && winnerSeats.length > 0 && showdown != null && !winnerSeats.includes(p.seat)}
                isDealer={dealerSeat === p.seat}
                isSB={sbSeat === p.seat}
                isBB={bbSeat === p.seat}
                timerPct={isActive ? countdown.pct : 100}
                timerTone={isActive ? timerToneClass(countdown) : undefined}
                // Past six seats the ring is too tight for a tile of its own,
                // so the picture moves onto the nameplate instead. A phone is
                // never wide enough for the tile.
                compactVideo={compact || slots > 6}
                topHalf={parseFloat(pos.top) < 50}
                stats={statsByName?.[p.name]}
                onInspect={onInspectPlayer ? () => onInspectPlayer(p) : undefined}
                handStrength={isMe ? handStrength : null}
                shine={isMe && heroShines && !p.is_folded}
                compact={compact}
              />
            ) : (
              <EmptySeat />
            )}
          </div>
        );
      })}

      {/* Bets, on the line between each seat and the pot */}
      {Array.from({ length: slots }, (_, visualIdx) => {
        const seat = (offset + visualIdx) % slots;
        const p = bySeat.get(seat);
        if (!p || !p.bet) return null;
        const pos = betPosition(visualIdx, slots, geometry);
        return (
          <div key={`bet-${seat}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-1
                       px-1.5 py-0.5 rounded-full bg-black/70 border border-(--color-highlight-edge)
                       shadow-lg shadow-black/60 animate-chip-in"
            style={{ top: pos.top, left: pos.left }}>
            <ChipStack amount={p.bet} size={10} />
            <span className="text-[11px] font-bold text-(--color-highlight-text) leading-none">
              {formatChips(p.bet, showBB, bb)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
