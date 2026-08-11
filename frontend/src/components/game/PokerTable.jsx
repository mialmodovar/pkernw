import useGameStore from "../../store/gameStore";
import PlayerSeat from "./PlayerSeat";
import CommunityCards from "./CommunityCards";
import PotDisplay from "./PotDisplay";

// Seats are spread evenly around the felt ellipse, so a short-handed table
// spaces its players out instead of bunching them at the bottom.
const RADIUS_X = 42; // % of container, from the centre
const RADIUS_Y = 38;

function seatPosition(index, total) {
  if (total <= 0) return { top: "50%", left: "50%" };
  // index 0 sits bottom-centre; the rest run around the table towards the left.
  const angle = (index / total) * 2 * Math.PI;
  return {
    left: `${50 - RADIUS_X * Math.sin(angle)}%`,
    top: `${50 + RADIUS_Y * Math.cos(angle)}%`,
  };
}

export default function PokerTable({ mySeat }) {
  const { players, actionOnSeat, holeCards, handNumber, winnerSeats, potAwards, allInEquity } = useGameStore();

  // Rotate seats so 'mySeat' is at position 0 (bottom center), keeping the
  // real going-round-the-table order of the remaining players.
  const rotatedPlayers = [...players];
  if (mySeat !== null && players.length > 0) {
    const seatSlots = Math.max(...players.map((p) => p.seat)) + 1;
    const relativeSeat = (seat) => (((seat - mySeat) % seatSlots) + seatSlots) % seatSlots;
    rotatedPlayers.sort((a, b) => relativeSeat(a.seat) - relativeSeat(b.seat));
  }

  return (
    <div className="relative w-[700px] h-[420px]">
      {/* Felt */}
      <div className="felt absolute inset-8 rounded-[50%]" />

      {/* Community cards + pot */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
        <CommunityCards />
        <PotDisplay />
        {handNumber > 0 && (
          <span className="text-xs text-(--color-text-muted)">Hand #{handNumber}</span>
        )}
      </div>

      {/* Seats */}
      {rotatedPlayers.map((p, visualIdx) => {
        const pos = seatPosition(visualIdx, rotatedPlayers.length);
        const isMe = p.seat === mySeat;
        return (
          <div key={p.seat}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ top: pos.top, left: pos.left }}>
            <PlayerSeat
              player={p}
              isMe={isMe}
              isActive={actionOnSeat === p.seat}
              myCards={isMe ? holeCards : null}
              isWinner={winnerSeats.includes(p.seat)}
              winAmount={potAwards?.filter((a) => a.seat === p.seat).reduce((s, a) => s + (a.amount || 0), 0) || 0}
              equity={allInEquity?.find((e) => e.seat === p.seat)?.equity ?? null}
            />
          </div>
        );
      })}
    </div>
  );
}
