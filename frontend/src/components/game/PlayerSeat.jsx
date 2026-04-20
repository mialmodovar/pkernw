import HoleCards from "./HoleCards";
import useGameStore from "../../store/gameStore";

function formatChips(amount, showBB, bb) {
  if (showBB && bb > 0) return `${(amount / bb).toFixed(1)} BB`;
  return amount?.toLocaleString();
}

export default function PlayerSeat({ player, isMe, isActive, myCards, isWinner, winAmount, equity }) {
  const showBB = useGameStore((s) => s.showBB);
  const bb = useGameStore((s) => s.level?.big_blind) || 0;
  const p = player;
  const borderColor = p.is_disconnected
    ? "border-red-500"
    : isActive
    ? "border-yellow-400"
    : isMe
    ? "border-green-500"
    : "border-gray-600";

  return (
    <div className={`flex flex-col items-center gap-1 w-28 ${p.is_disconnected ? "opacity-60" : ""}`}>
      {/* Disconnected indicator */}
      {p.is_disconnected && !p.is_eliminated && (
        <div className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded text-center">
          DISCONNECTED
        </div>
      )}
      {/* Winner banner */}
      {isWinner && (
        <div className="bg-yellow-500 text-black text-xs font-extrabold px-2 py-0.5 rounded shadow-lg animate-pulse text-center">
          WINNER +{formatChips(winAmount, showBB, bb)}
        </div>
      )}
      {/* Equity display during all-in */}
      {equity !== null && !isWinner && (
        <div className={`text-xs font-bold px-2 py-0.5 rounded text-center ${
          equity >= 50 ? "bg-green-600 text-white" : "bg-red-700 text-white"
        }`}>
          {equity.toFixed(1)}%
        </div>
      )}
      {/* Bet chip — shown between cards and table center */}
      {p.bet > 0 && (
        <div className="flex items-center gap-1 mb-0.5">
          <span className="w-3 h-3 rounded-full bg-yellow-500 border border-yellow-300 inline-block shadow" />
          <span className="text-xs font-bold text-yellow-300">{formatChips(p.bet, showBB, bb)}</span>
        </div>
      )}
      <HoleCards
        cards={isMe ? myCards : p.cards}
        folded={p.is_folded}
        eliminated={p.is_eliminated}
      />
      <div className={`bg-gray-800 rounded-lg px-3 py-1 border-2 ${borderColor} text-center w-full`}>
        <div className="text-xs font-semibold truncate">{p.name}</div>
        <div className="text-xs text-gray-400">
          {p.is_eliminated ? (
            <span className="text-red-400">Out</span>
          ) : (
            <>{formatChips(p.chips, showBB, bb)}</>
          )}
        </div>
      </div>
      {isActive && (
        <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
      )}
    </div>
  );
}
