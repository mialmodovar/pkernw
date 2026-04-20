import useGameStore from "../../store/gameStore";
import PlayerSeat from "./PlayerSeat";
import CommunityCards from "./CommunityCards";
import PotDisplay from "./PotDisplay";

// Positions for up to 9 seats around an oval table (CSS % offsets)
const SEAT_POSITIONS = [
  { top: "82%", left: "50%" },   // 0 — bottom center
  { top: "72%", left: "15%" },   // 1
  { top: "38%", left: "4%" },    // 2
  { top: "8%",  left: "18%" },   // 3
  { top: "2%",  left: "50%" },   // 4
  { top: "8%",  left: "82%" },   // 5
  { top: "38%", left: "96%" },   // 6
  { top: "72%", left: "85%" },   // 7
  { top: "82%", left: "50%" },   // 8 — same as 0 fallback
];

export default function PokerTable({ mySeat }) {
  const { players, actionOnSeat, holeCards, handNumber, winnerSeats, potAwards, allInEquity } = useGameStore();

  // Rotate seats so 'mySeat' is at position 0 (bottom center)
  const rotatedPlayers = [...players];
  if (mySeat !== null && players.length > 0) {
    const offset = mySeat;
    rotatedPlayers.sort(
      (a, b) => ((a.seat - offset + players.length) % players.length) -
                ((b.seat - offset + players.length) % players.length)
    );
  }

  return (
    <div className="relative w-[700px] h-[420px]">
      {/* Felt */}
      <div className="absolute inset-8 rounded-[50%] bg-green-900 border-4 border-green-800 shadow-2xl" />

      {/* Community cards + pot */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
        <CommunityCards />
        <PotDisplay />
        {handNumber > 0 && (
          <span className="text-xs text-gray-500">Hand #{handNumber}</span>
        )}
      </div>

      {/* Seats */}
      {rotatedPlayers.map((p, visualIdx) => {
        const pos = SEAT_POSITIONS[visualIdx] || SEAT_POSITIONS[0];
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
