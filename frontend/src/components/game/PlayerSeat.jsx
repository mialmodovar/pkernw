import HoleCards from "./HoleCards";
import useGameStore from "../../store/gameStore";
import { formatChips } from "./formatChips";

// Sits in normal flow between the cards and the nameplate: absolute placement
// put the button on top of the hole cards, and stacked the dealer disc over the
// blind pill when one player held both (heads-up).
function PositionMarker({ isDealer, isSB, isBB }) {
  if (!isDealer && !isSB && !isBB) return null;
  return (
    <div className="flex items-center justify-center gap-1">
      {isDealer && (
        <span
          title="Dealer"
          className="w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-extrabold
                     bg-[linear-gradient(135deg,#efe9e3,#b9b0a7)] text-[#1a1208]
                     border border-[#8c8379] shadow shadow-black/50"
        >
          D
        </span>
      )}
      {(isSB || isBB) && (
        <span
          title={isSB ? "Small blind" : "Big blind"}
          className="px-1.5 h-5 flex items-center rounded text-[9px] font-bold
                     bg-black/60 text-(--color-silver) border border-(--color-border)"
        >
          {isSB ? "SB" : "BB"}
        </span>
      )}
    </div>
  );
}

// Thin ring that drains while this seat is on the clock.
function TimerRing({ pct }) {
  return (
    <div className="w-full h-1 rounded-full overflow-hidden bg-black/50 border border-(--color-border)">
      <div
        className="h-full bg-[#c9a227] transition-all duration-1000 ease-linear"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

export default function PlayerSeat({
  player, isMe, isActive, myCards, isWinner, winAmount, equity,
  isDealer, isSB, isBB, timerPct,
}) {
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
    <div className={`relative flex flex-col items-center gap-1 w-[clamp(5rem,11vw,7rem)] ${p.is_disconnected ? "opacity-60" : ""}`}>
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
        <div className="flex items-center gap-1 mb-0.5 animate-chip-in">
          <span className="w-3 h-3 rounded-full bg-[linear-gradient(135deg,#d4af37,#8a6c18)] border border-[#e0c66b] inline-block shadow" />
          <span className="text-xs font-bold text-[#d9c07a]">{formatChips(p.bet, showBB, bb)}</span>
        </div>
      )}
      <HoleCards
        cards={isMe ? myCards : p.cards}
        folded={p.is_folded}
        eliminated={p.is_eliminated}
      />
      <PositionMarker isDealer={isDealer} isSB={isSB} isBB={isBB} />
      <div className={`bg-[linear-gradient(160deg,rgba(56,34,38,0.95),rgba(16,10,11,0.95))] rounded-lg px-3 py-1 border-2 ${borderColor} text-center w-full shadow-lg shadow-black/50`}>
        <div className="text-xs font-semibold truncate text-(--color-silver)">{p.name}</div>
        <div className="text-xs text-(--color-text-muted)">
          {p.is_eliminated ? (
            <span className="text-[#c76b7a]">Out</span>
          ) : p.is_all_in ? (
            <span className="text-[#d9c07a] font-bold">ALL IN</span>
          ) : (
            <>{formatChips(p.chips, showBB, bb)}</>
          )}
        </div>
      </div>
      {isActive && <TimerRing pct={timerPct ?? 100} />}
    </div>
  );
}
