import { useEffect, useState } from "react";

import Avatar from "../Avatar";
import HoleCards from "./HoleCards";
import SeatBubble from "./SeatBubble";
import SeatQuickChat from "./SeatQuickChat";
import useMediaStore from "../../store/mediaStore";
import SeatVideo from "./SeatVideo";
import useGameStore from "../../store/gameStore";
import { formatChips } from "./formatChips";
import { formatEuros } from "./formatMoney";
import { vpipTone } from "./playerProfile";
import { positionHint } from "./tablePositions";

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
  position, timerPct, timerTone, showdownEntry, faceDownAtShowdown, dimmed, topHalf,
  stats, onInspect, handStrength, shine, raisedCards, compactVideo, compact = false,
}) {
  const showBB = useGameStore((s) => s.showBB);
  const hideHand = useGameStore((s) => s.hideHand);
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
      {/* Back from a rebuy, at the table but not in the hand being dealt. The
          alternative was being invisible until the next one, which reads as a
          rebuy that did not work. */}
      {p.is_waiting && !p.is_eliminated && (
        <div className="bg-(--color-highlight-dim) text-(--color-highlight-pale) text-[10px] font-bold px-1.5 py-0.5 rounded border border-(--color-highlight-edge) text-center">
          WAITING
        </div>
      )}
      {p.is_sitting_out && !p.is_eliminated && !p.is_waiting && (
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
        raisedCards={raisedCards}
        shine={shine}
        // Only your own, only while the hand is live: once it is turned over
        // at showdown it belongs to the table, and covering it then would be
        // hiding it from you alone.
        hideUntilHover={isMe && hideHand && !showdownEntry}
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

  // The plate is the stats target and the stack inside it is the chips/BB
  // toggle, so this is a div with button semantics rather than a real <button>:
  // a button inside a button is not something HTML allows.
  //
  // Its left padding is the avatar's doing: the plate runs the full width of
  // the seat and passes underneath the picture, so the text has to start clear
  // of it. See `body` below for the geometry.
  const plate = (
    <div key="plate" role="button" tabIndex={0} onClick={onInspect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onInspect?.();
        }
      }}
      title={`${p.name} — tap for stats`}
      style={{
        // The plate already starts at the middle of the picture (see `body`),
        // so this is only the rest of the way clear of it.
        paddingLeft: "calc(var(--seat-avatar) * 0.62)",
        // At least as deep as the half of the picture that overlaps it, so the
        // circle never hangs below the plate it is supposed to be sitting on —
        // and so the name has room above and below it either way.
        minHeight: "calc(var(--seat-avatar) * 0.5)",
      }}
      className={`relative bg-[linear-gradient(160deg,var(--color-surface-raised),var(--color-surface-sunken))] rounded-lg pr-2 py-1.5 border-2 ${borderColor} w-full shadow-lg shadow-black/50
                     flex items-center gap-2 text-left cursor-pointer hover:border-(--color-border-strong) transition-colors`}>
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
      {/* The two things worth carrying on the table itself, in one column on
          the far edge of the plate: how loose they are, and where they are
          sitting this hand. */}
      {(stats?.hands > 0 || position) && (
        <span className="shrink-0 flex flex-col items-end gap-px leading-none">
          {/* A bare figure said nothing about what it was, so it is labelled —
              and coloured by how loose it is, which is the part you read at a
              glance. */}
          {stats?.hands > 0 && (
            <span className={`hidden @[640px]:flex items-baseline gap-0.5 leading-none ${vpipTone(stats).color}`}
              title={`VPIP ${stats.vpip_pct}% — ${p.name} enters ${stats.vpip_pct}% of hands (${stats.hands} recorded, ${vpipTone(stats).word})`}>
              <span className="text-[8px] font-bold uppercase tracking-wide opacity-70">vpip</span>
              <span className="text-[10px] font-semibold">{Math.round(stats.vpip_pct)}</span>
            </span>
          )}
          {/* Under the VPIP: the same glance that tells you how wide they play
              tells you how much position they have to play it from. */}
          {position && (
            <span
              title={`${p.name} is ${positionHint(position) || `in ${position}`}`}
              className="hidden @[520px]:block text-[9px] font-bold uppercase tracking-wide text-(--color-text-muted)"
            >
              {position}
            </span>
          )}
        </span>
      )}
    </div>
  );

  // The face, big and round, on the left of the seat. It is the anchor the rest
  // of the seat is arranged around: the hole cards sit beside its top half and
  // the nameplate slides out from under its bottom half, so a seat reads as one
  // person rather than as a column of parts. When the table is too crowded for
  // a video tile of its own, this is where the camera goes — same circle, same
  // place, whether it is a photo or a face that moves.
  const face = (
    <span
      title={p.name}
      style={{
        // Solid, not the translucent surface the panels use: this circle sits
        // over the nameplate and over the felt, and either showing through an
        // emoji avatar makes the face look like a hole in the seat. Same
        // gradient as everywhere else, painted onto an opaque base — the trick
        // .panel-solid uses in index.css, for the same reason.
        background:
          "linear-gradient(160deg, var(--color-surface-raised), var(--color-surface-sunken)), var(--panel-floating-bg)",
      }}
      className={`absolute left-0 top-0 -translate-y-1/2 z-20 rounded-full overflow-hidden
                  border-2 ${borderColor}
                  shadow-lg shadow-black/60 w-[var(--seat-avatar)] h-[var(--seat-avatar)]
                  ${isActive ? "ring-2 ring-(--color-highlight-edge)" : ""}`}
    >
      {liveStream ? (
        <SeatVideo peer={{ stream: liveStream, video: true, status: "connected", videoFlowing: true }}
          name={p.name} mirrored={!!myStream} muted={!!myStream} bare />
      ) : (
        <Avatar url={p.avatar_url} emoji={p.avatar} name={p.name}
          className="w-full h-full"
          emojiClassName="text-[calc(var(--seat-avatar)*0.5)]" />
      )}
    </span>
  );

  // Cards beside the avatar's upper half, plate under its lower half. The plate
  // is what sets where the seam is — the avatar is pinned to its top edge and
  // pulled up by half its own height — so the two rows meet at the middle of
  // the picture however tall the cards happen to be.
  const body = (
    <div key="body" className="w-full">
      <div className="flex items-end justify-start gap-1 min-h-[calc(var(--seat-avatar)/2)]"
        style={{ paddingLeft: "calc(var(--seat-avatar) * 1.12)" }}>
        {cards}
        {/* Only at your own seat — you can only speak for yourself — and not on
            a phone, where the seat has no room beside the cards for it and the
            bar across the top carries the same list. */}
        {isMe && !compact && <SeatQuickChat />}
      </div>
      {/* The plate begins halfway across the picture rather than beside it, so
          its left edge and corners are behind the circle and what you see is a
          nameplate coming out from under a face. The padding moves the plate
          only: an absolutely positioned box is placed against the padding edge,
          so the circle stays at the seat's left edge where the cards above are
          measured from. */}
      <div className="relative" style={{ paddingLeft: "calc(var(--seat-avatar) * 0.5)" }}>
        {plate}
        {face}
      </div>
    </div>
  );

  const ring = isActive ? <TimerRing key="ring" pct={timerPct ?? 100} tone={timerTone} /> : null;
  // On the outer edge, against the nameplate, and only when there is a picture
  // to show — nobody's seat moves because someone else turned a camera on.
  // On a crowded table the picture rides in the avatar circle (see liveStream
  // above); everywhere else it gets its own tile on the outer edge.
  const video = compactVideo ? null
    : myStream
      ? <SeatVideo key="video" peer={{ stream: myStream, video: true, status: "connected", videoFlowing: true }} name={p.name} mirrored muted />
      : media ? <SeatVideo key="video" peer={media} name={p.name} /> : null;
  const stack = topHalf
    ? [ring, video, body, badges]
    : [badges, body, video, ring];

  // A phone has no room to spare: the seat ring runs down the long sides of the
  // screen, so a seat that grows sideways runs off it. The picture is still the
  // biggest thing in a seat there, just not as big as it gets on a table with
  // room around it.
  return (
    <div
      style={{ "--seat-avatar": compact ? (isMe ? "3rem" : "2.75rem") : "clamp(3.6rem,11.75cqw,6.25rem)" }}
      className={`relative flex flex-col items-center gap-1 transition-opacity duration-500 ${
        compact ? (isMe ? "w-[7.5rem]" : "w-[6.75rem]") : "w-[clamp(8.75rem,27cqw,15rem)]"
      } ${
        p.is_disconnected ? "opacity-60" : (dimmed || p.is_waiting) ? "opacity-45" : ""
      }`}>
      {stack}
      {/* Over the seat rather than only in the chat panel: what somebody says
          at a table belongs to the player it came from. */}
      <SeatBubble userId={p.user_id} name={p.name} />
    </div>
  );
}
