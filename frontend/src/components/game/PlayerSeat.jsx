import { useEffect, useState } from "react";

import HoleCards from "./HoleCards";
import useMediaStore from "../../store/mediaStore";
import SeatVideo from "./SeatVideo";
import useGameStore from "../../store/gameStore";
import { formatChips } from "./formatChips";
import { formatEuros } from "./formatMoney";
import { vpipTone } from "./playerProfile";

const BOUNTY_FLASH_MS = 2200;

// The badge that announces a knockout, and the bump on the pill it just topped
// up. Both hang off one flash from the store, and both clear themselves — the
// seat should not still be celebrating three hands later.
function useBountyFlash(seat) {
  const flash = useGameStore((s) => s.bountyFlash);
  const mine = flash && flash.seat === seat ? flash : null;
  // Which flash has already had its moment. Held by id rather than by the flash
  // itself, so a second knockout on the same seat starts a fresh animation
  // instead of being mistaken for the one still fading out.
  const [spentId, setSpentId] = useState(null);
  const flashId = mine ? mine.id : null;

  useEffect(() => {
    if (flashId == null) return undefined;
    const timer = setTimeout(() => setSpentId(flashId), BOUNTY_FLASH_MS);
    return () => clearTimeout(timer);
  }, [flashId]);

  return flashId != null && flashId !== spentId ? mine : null;
}

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

// Thin ring that drains while this seat is on the clock. Its colour comes from
// the same helper the action panel uses, so a seat in its time bank reads red
// there too rather than staying gold to the last second.
function TimerRing({ pct, tone = "bg-(--color-highlight)" }) {
  return (
    <div className="w-full h-1 rounded-full overflow-hidden bg-black/50 border border-(--color-border)">
      <div
        className={`h-full transition-all duration-1000 ease-linear ${tone}`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

export default function PlayerSeat({
  player, isMe, isActive, myCards, isWinner, winAmount, equity,
  isDealer, isSB, isBB, timerPct, timerTone, showdownEntry, faceDownAtShowdown, dimmed, topHalf,
  stats, onInspect, handStrength, shine, compactVideo, compact = false,
}) {
  const showBB = useGameStore((s) => s.showBB);
  const toggleBB = useGameStore((s) => s.toggleBB);
  const media = useMediaStore((s) => s.peers[player.user_id]);
  const myStream = useMediaStore((s) => (isMe && s.cameraOn ? s.localStream : null));
  // Only used when the table is too crowded for a tile of its own.
  const liveStream = compactVideo
    ? (myStream || (media?.video && media.videoFlowing !== false ? media.stream : null))
    : null;
  const bb = useGameStore((s) => s.level?.big_blind) || 0;
  const p = player;
  const bountyFlash = useBountyFlash(p.seat);
  const bountyCents = p.bounty_cents || 0;
  const borderColor = p.is_disconnected
    ? "border-(--color-accent)"
    : isActive
    ? "border-(--color-highlight)"
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
        <div className="bg-(--color-highlight-dim) text-(--color-highlight-pale) text-[10px] font-bold px-1.5 py-0.5 rounded border border-(--color-highlight-edge) text-center">
          SITTING OUT
        </div>
      )}
      {p.is_disconnected && !p.is_eliminated && (
        <div className="bg-(--color-accent-deep) text-(--color-silver) text-[10px] font-bold px-1.5 py-0.5 rounded border border-[rgba(196,178,165,0.25)] text-center">
          DISCONNECTED
        </div>
      )}
      {isWinner && (
        <div className="bg-[linear-gradient(135deg,var(--color-highlight-bright),var(--color-highlight-deep))] text-(--color-highlight-ink) text-xs font-extrabold px-2 py-0.5 rounded shadow-lg animate-pulse text-center">
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
        shine={shine}
        // On a phone every seat shrinks; the hero keeps board-sized cards,
        // since that is the one hand you actually have to read.
        size={compact && isMe ? "board" : "seat"}
      />
      {/* Your own read on what you hold, next to your cards. */}
      {isMe && handStrength && !p.is_folded && !showdownEntry && (
        <div className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-center
                        bg-black/60 border border-(--color-border) text-(--color-highlight-text) whitespace-nowrap">
          {handStrength}
        </div>
      )}
      {showdownEntry && !faceDownAtShowdown && (
        <div className={`text-[10px] font-semibold px-1.5 py-0.5 rounded text-center ${
          isWinner ? "text-(--color-highlight-text)" : "text-(--color-text-muted)"
        }`}>
          {showdownEntry.hand_name}
        </div>
      )}
    </div>
  );

  const markers = <PositionMarker key="markers" isDealer={isDealer} isSB={isSB} isBB={isBB} />;

  // The plate is the stats target and the stack inside it is the chips/BB
  // toggle, so this is a div with button semantics rather than a real <button>:
  // a button inside a button is not something HTML allows.
  const plate = (
    <div key="plate" role="button" tabIndex={0} onClick={onInspect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onInspect?.();
        }
      }}
      title={`${p.name} — tap for stats`}
      className={`relative bg-[linear-gradient(160deg,var(--color-surface-raised),var(--color-surface-sunken))] rounded-lg px-1.5 py-1 border-2 ${borderColor} w-full shadow-lg shadow-black/50
                     flex items-center gap-1 text-left cursor-pointer hover:border-(--color-border-strong) transition-colors`}>
      {/* What this seat is worth to whoever busts them — pinned to the plate
          rather than tucked inside it, because it is a price on a head and not
          another stat. Gone once they are out: the bounty went with them, to
          whoever collected it. */}
      {bountyCents > 0 && !p.is_eliminated && (
        <span
          key={bountyFlash?.id || "bounty"}
          title={`${p.name} is worth ${formatEuros(bountyCents)} to whoever knocks them out`}
          className={`absolute -top-2 -right-1 z-10 px-1.5 py-px rounded-full text-[10px] font-extrabold leading-none
                      bg-[linear-gradient(135deg,var(--color-highlight-bright),var(--color-highlight-deep))]
                      text-(--color-highlight-ink) border border-(--color-highlight-deeper)
                      shadow shadow-black/60 whitespace-nowrap
                      ${bountyFlash ? "animate-bounty-bump" : ""}`}
        >
          {formatEuros(bountyCents)}
        </span>
      )}

      {/* The knockout itself. Lands on the seat that collected it, holds long
          enough to read whose bounty it was, then floats away. */}
      {bountyFlash && (
        <span
          key={bountyFlash.id}
          className="animate-bounty-collect pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 z-20
                     px-2 py-0.5 rounded-md text-center whitespace-nowrap
                     bg-[linear-gradient(135deg,var(--color-highlight-lift),var(--color-highlight))]
                     text-(--color-highlight-ink) border border-(--color-highlight-deeper)
                     shadow-lg shadow-black/60"
        >
          <span className="block text-[11px] font-extrabold leading-tight">
            KO +{formatEuros(bountyFlash.cashCents)}
          </span>
          <span className="block text-[8px] font-semibold leading-tight opacity-80">
            {bountyFlash.toHeadCents > 0
              ? `${formatEuros(bountyFlash.toHeadCents)} onto their head`
              : bountyFlash.victimName}
          </span>
        </span>
      )}

      {liveStream ? (
        <span className={`${compact ? "w-7 h-7" : "w-11 h-11"} rounded-full overflow-hidden shrink-0 border border-(--color-border)`}>
          <SeatVideo peer={{ stream: liveStream, video: true, status: "connected", videoFlowing: true }}
            name={p.name} mirrored={!!myStream} muted={!!myStream} bare />
        </span>
      ) : (
        <span className="text-xs leading-none shrink-0">{p.avatar || "\u{1F0CF}"}</span>
      )}
      {/* A microphone with no camera changes nothing about the layout. */}
      {media?.audio && media.status === "connected" && (
        <span className="text-[10px] leading-none shrink-0" title={`${p.name} has their microphone on`}>
          {"\u{1F3A4}"}
        </span>
      )}
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-xs font-semibold truncate text-(--color-silver)">{p.name}</div>
        <div className="text-[11px] text-(--color-text-muted)">
          {p.is_eliminated ? (
            <span className="text-(--color-accent-link)">Out</span>
          ) : p.is_all_in ? (
            <span className="text-(--color-highlight-text) font-bold">ALL IN</span>
          ) : (
            // Any stack at the table flips the whole table between chips and big
            // blinds — the comparison you want is usually somebody else's stack,
            // so you shouldn't have to find your own to ask for it.
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); toggleBB(); }}
              title={showBB ? "Showing big blinds — tap for chips" : "Showing chips — tap for big blinds"}
              className="rounded px-0.5 -mx-0.5 hover:bg-white/10 hover:text-(--color-silver) transition-colors"
            >
              {formatChips(p.chips, showBB, bb)}
            </button>
          )}
        </div>
      </div>
      {/* The one number worth carrying on the table itself. A bare figure said
          nothing about what it was, so it is labelled — and coloured by how
          loose it is, which is the part you read at a glance. */}
      {stats?.hands > 0 && (
        <span className={`hidden @[640px]:flex shrink-0 items-baseline gap-0.5 leading-none ${vpipTone(stats).color}`}
          title={`VPIP ${stats.vpip_pct}% — ${p.name} enters ${stats.vpip_pct}% of hands (${stats.hands} recorded, ${vpipTone(stats).word})`}>
          <span className="text-[8px] font-bold uppercase tracking-wide opacity-70">vpip</span>
          <span className="text-[10px] font-semibold">{Math.round(stats.vpip_pct)}</span>
        </span>
      )}
    </div>
  );

  const ring = isActive ? <TimerRing key="ring" pct={timerPct ?? 100} tone={timerTone} /> : null;
  // On the outer edge, against the nameplate, and only when there is a picture
  // to show — nobody's seat moves because someone else turned a camera on.
  // On a crowded table the picture rides on the nameplate (see liveStream
  // above); everywhere else it gets its own tile on the outer edge.
  const video = compactVideo ? null
    : myStream
      ? <SeatVideo key="video" peer={{ stream: myStream, video: true, status: "connected", videoFlowing: true }} name={p.name} mirrored muted />
      : media ? <SeatVideo key="video" peer={media} name={p.name} /> : null;
  const stack = topHalf
    ? [ring, video, plate, markers, cards, badges]
    : [badges, cards, markers, plate, video, ring];

  return (
    <div className={`relative flex flex-col items-center gap-1 transition-opacity duration-500 ${
      compact ? (isMe ? "w-[5.5rem]" : "w-[4.5rem]") : "w-[clamp(4.75rem,15cqw,8.5rem)]"
    } ${
      p.is_disconnected ? "opacity-60" : dimmed ? "opacity-45" : ""
    }`}>
      {stack}
    </div>
  );
}
