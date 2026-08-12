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
  isDealer, isSB, isBB, timerPct, showdownEntry, faceDownAtShowdown, dimmed, topHalf,
  stats, onInspect, handStrength,
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

  // The column always ran badges → cards → plate, which puts the nameplate on
  // the far side from the board. That reads as "outside the table" for seats
  // below the centre and "inside it" for seats above, so the order flips for
  // the top half and the plate always ends up on the outer edge.
  const badges = (
    <div key="badges" className="flex flex-col items-center gap-1">
      {p.is_sitting_out && !p.is_eliminated && (
        <div className="bg-[#3d2f0b] text-[#e6d9a8] text-[10px] font-bold px-1.5 py-0.5 rounded border border-[rgba(224,198,107,0.4)] text-center">
          SITTING OUT
        </div>
      )}
      {p.is_disconnected && !p.is_eliminated && (
        <div className="bg-[#5a1420] text-[#e8d5d8] text-[10px] font-bold px-1.5 py-0.5 rounded border border-[rgba(196,178,165,0.25)] text-center">
          DISCONNECTED
        </div>
      )}
      {isWinner && (
        <div className="bg-[linear-gradient(135deg,#d4af37,#a17c1e)] text-[#1a1208] text-xs font-extrabold px-2 py-0.5 rounded shadow-lg animate-pulse text-center">
          WINNER +{formatChips(winAmount, showBB, bb)}
        </div>
      )}
      {equity !== null && !isWinner && (
        <div className={`text-xs font-bold px-2 py-0.5 rounded text-center border border-[rgba(196,178,165,0.25)] ${
          equity >= 50 ? "bg-[#2f5d4a] text-[#e6efe9]" : "bg-[#5a1420] text-[#e8d5d8]"
        }`}>
          {equity.toFixed(1)}%
        </div>
      )}
    </div>
  );

  const cards = (
    <div key="cards" className="flex flex-col items-center gap-1">
      <HoleCards
        cards={isMe ? myCards : p.cards}
        folded={p.is_folded}
        eliminated={p.is_eliminated}
        isMe={isMe}
        faceDown={faceDownAtShowdown}
        winningCards={isWinner ? showdownEntry?.best_cards : null}
      />
      {/* Your own read on what you hold, next to your cards. */}
      {isMe && handStrength && !p.is_folded && !showdownEntry && (
        <div className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-center
                        bg-black/60 border border-(--color-border) text-[#d9c07a] whitespace-nowrap">
          {handStrength}
        </div>
      )}
      {showdownEntry && !faceDownAtShowdown && (
        <div className={`text-[10px] font-semibold px-1.5 py-0.5 rounded text-center ${
          isWinner ? "text-[#d9c07a]" : "text-(--color-text-muted)"
        }`}>
          {showdownEntry.hand_name}
        </div>
      )}
    </div>
  );

  const markers = <PositionMarker key="markers" isDealer={isDealer} isSB={isSB} isBB={isBB} />;

  const plate = (
    <button key="plate" type="button" onClick={onInspect}
      title={`${p.name} — tap for stats`}
      className={`bg-[linear-gradient(160deg,rgba(56,34,38,0.95),rgba(16,10,11,0.95))] rounded-lg pl-1.5 pr-2 py-1 border-2 ${borderColor} w-full shadow-lg shadow-black/50
                     flex items-center gap-1.5 text-left cursor-pointer hover:border-(--color-border-strong) transition-colors`}>
      <span className="text-base leading-none shrink-0">{p.avatar || "\u{1F0CF}"}</span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-xs font-semibold truncate text-(--color-silver)">{p.name}</div>
        <div className="text-[11px] text-(--color-text-muted)">
          {p.is_eliminated ? (
            <span className="text-[#c76b7a]">Out</span>
          ) : p.is_all_in ? (
            <span className="text-[#d9c07a] font-bold">ALL IN</span>
          ) : (
            <>{formatChips(p.chips, showBB, bb)}</>
          )}
        </div>
      </div>
      {/* The one number worth carrying on the table itself. */}
      {stats?.hands > 0 && (
        <span className="shrink-0 text-[10px] font-semibold text-[#d9c07a] leading-none"
          title={`VPIP ${stats.vpip_pct}% over ${stats.hands} hands`}>
          {Math.round(stats.vpip_pct)}
        </span>
      )}
    </button>
  );

  const ring = isActive ? <TimerRing key="ring" pct={timerPct ?? 100} /> : null;
  const stack = topHalf
    ? [ring, plate, markers, cards, badges]
    : [badges, cards, markers, plate, ring];

  return (
    <div className={`relative flex flex-col items-center gap-1 w-[clamp(5rem,11vw,7rem)] transition-opacity duration-500 ${
      p.is_disconnected ? "opacity-60" : dimmed ? "opacity-45" : ""
    }`}>
      {stack}
    </div>
  );
}
