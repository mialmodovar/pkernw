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
    ? "border-[#8a1c2b]"
    : isActive
    ? "border-[#c9a227]"
    : isMe
    ? "border-[rgba(196,178,165,0.55)]"
    : "border-[rgba(196,178,165,0.18)]";

  return (
    <div className={`flex flex-col items-center gap-1 w-28 ${p.is_disconnected ? "opacity-60" : ""}`}>
      {/* Disconnected indicator */}
      {p.is_disconnected && !p.is_eliminated && (
        <div className="bg-[#5a1420] text-[#e8d5d8] text-[10px] font-bold px-1.5 py-0.5 rounded border border-[rgba(196,178,165,0.25)] text-center">
          DISCONNECTED
        </div>
      )}
      {/* Winner banner */}
      {isWinner && (
        <div className="bg-[linear-gradient(135deg,#d4af37,#a17c1e)] text-[#1a1208] text-xs font-extrabold px-2 py-0.5 rounded shadow-lg animate-pulse text-center">
          WINNER +{formatChips(winAmount, showBB, bb)}
        </div>
      )}
      {/* Equity display during all-in */}
      {equity !== null && !isWinner && (
        <div className={`text-xs font-bold px-2 py-0.5 rounded text-center border border-[rgba(196,178,165,0.25)] ${
          equity >= 50 ? "bg-[#2f5d4a] text-[#e6efe9]" : "bg-[#5a1420] text-[#e8d5d8]"
        }`}>
          {equity.toFixed(1)}%
        </div>
      )}
      {/* Bet chip — shown between cards and table center */}
      {p.bet > 0 && (
        <div className="flex items-center gap-1 mb-0.5">
          <span className="w-3 h-3 rounded-full bg-[linear-gradient(135deg,#d4af37,#8a6c18)] border border-[#e0c66b] inline-block shadow" />
          <span className="text-xs font-bold text-[#d9c07a]">{formatChips(p.bet, showBB, bb)}</span>
        </div>
      )}
      <HoleCards
        cards={isMe ? myCards : p.cards}
        folded={p.is_folded}
        eliminated={p.is_eliminated}
      />
      <div className={`bg-[linear-gradient(160deg,rgba(56,34,38,0.95),rgba(16,10,11,0.95))] rounded-lg px-3 py-1 border-2 ${borderColor} text-center w-full shadow-lg shadow-black/50`}>
        <div className="text-xs font-semibold truncate text-(--color-silver)">{p.name}</div>
        <div className="text-xs text-(--color-text-muted)">
          {p.is_eliminated ? (
            <span className="text-[#c76b7a]">Out</span>
          ) : (
            <>{formatChips(p.chips, showBB, bb)}</>
          )}
        </div>
      </div>
      {isActive && (
        <div className="w-2 h-2 bg-[#c9a227] rounded-full animate-pulse" />
      )}
    </div>
  );
}
