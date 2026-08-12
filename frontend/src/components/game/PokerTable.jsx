import useGameStore from "../../store/gameStore";
import PlayerSeat from "./PlayerSeat";
import CommunityCards from "./CommunityCards";
import PotDisplay from "./PotDisplay";
import { useActionCountdown } from "./useActionCountdown";
import { useShowdownReveal } from "./useShowdownReveal";

// Seats sit on the felt ellipse. Slots are laid out from the table's CAPACITY,
// not from the number of players present, so nobody's seat shifts when
// someone busts.
// Kept short of the container edges so a seat's full card/marker/nameplate
// stack still fits inside the table area instead of being covered by the
// action panel below.
const RADIUS_X = 42; // % of container, from the centre
const RADIUS_Y = 32;

function slotPosition(index, capacity) {
  if (capacity <= 0) return { top: "50%", left: "50%" };
  // index 0 sits bottom-centre; the rest run around the table towards the left.
  const angle = (index / capacity) * 2 * Math.PI;
  return {
    left: `${50 - RADIUS_X * Math.sin(angle)}%`,
    top: `${50 + RADIUS_Y * Math.cos(angle)}%`,
  };
}

function EmptySeat() {
  return (
    <div className="w-[clamp(5rem,11vw,7rem)] rounded-lg px-3 py-2 text-center
                    border border-dashed border-(--color-border) bg-black/25">
      <div className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">Empty</div>
    </div>
  );
}

export default function PokerTable({ mySeat, capacity }) {
  const {
    players, actionOnSeat, holeCards, handNumber, winnerSeats, potAwards, allInEquity,
    dealerSeat, sbSeat, bbSeat, showdown,
  } = useGameStore();
  const countdown = useActionCountdown();
  const revealedSeats = useShowdownReveal(showdown);

  // Winners are known from pot_awarded; their best five get the gold ring, and
  // the losing hands dim so the eye goes to what actually won.
  const showdownBySeat = new Map((showdown || []).map((entry) => [entry.seat, entry]));
  const winningBoardCards = winnerSeats.flatMap((seat) => showdownBySeat.get(seat)?.best_cards || []);

  // Fall back to what the seat numbers imply until capacity is known.
  const highestSeat = players.length ? Math.max(...players.map((p) => p.seat)) + 1 : 0;
  const slots = Math.max(capacity || 0, highestSeat, players.length, 1);

  // Rotate slots so the hero's seat lands on the bottom-centre position.
  const offset = mySeat ?? 0;
  const bySeat = new Map(players.map((p) => [p.seat, p]));

  return (
    <div className="relative w-full max-w-[820px] aspect-[5/3] mx-auto">
      {/* Felt */}
      <div className="felt absolute inset-[7%] rounded-[50%]" />

      {/* Community cards + pot */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
        <CommunityCards winningCards={winningBoardCards} />
        <PotDisplay />
        {handNumber > 0 && (
          <span className="text-xs text-(--color-text-muted)">Hand #{handNumber}</span>
        )}
      </div>

      {/* Seats — one per slot, occupied or not */}
      {Array.from({ length: slots }, (_, visualIdx) => {
        const seat = (offset + visualIdx) % slots;
        const p = bySeat.get(seat);
        const pos = slotPosition(visualIdx, slots);
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
                isWinner={winnerSeats.includes(p.seat)}
                winAmount={potAwards?.filter((a) => a.seat === p.seat).reduce((s, a) => s + (a.amount || 0), 0) || 0}
                equity={allInEquity?.find((e) => e.seat === p.seat)?.equity ?? null}
                showdownEntry={showdownBySeat.get(p.seat)}
                faceDownAtShowdown={revealedSeats != null && !revealedSeats.has(p.seat) && !isMe}
                dimmed={winnerSeats.length > 0 && showdown != null && !winnerSeats.includes(p.seat)}
                isDealer={dealerSeat === p.seat}
                isSB={sbSeat === p.seat}
                isBB={bbSeat === p.seat}
                timerPct={isActive ? countdown.pct : 100}
              />
            ) : (
              <EmptySeat />
            )}
          </div>
        );
      })}
    </div>
  );
}
