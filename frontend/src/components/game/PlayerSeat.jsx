import { useEffect, useState } from "react";

import Avatar from "../Avatar";
import HoleCards from "./HoleCards";
import SeatBubble from "./SeatBubble";
import SeatActionPill from "./SeatActionPill";
import SeatQuickChat from "./SeatQuickChat";
import useMediaStore from "../../store/mediaStore";
import SeatVideo from "./SeatVideo";
import useGameStore from "../../store/gameStore";
import { formatChips } from "./formatChips";
import OutsBubble from "./OutsBubble";
import { useShowCardsOffer } from "./showCards";
import { useBountyMoney } from "./useBountyMoney";
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

// The ring is drawn on a 100-unit square whatever size the face is, so one set
// of numbers works at every seat size.
const RING_RADIUS = 47;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * The clock, drawn around the face of whoever is on it.
 *
 * A bar under the seat was a bar: it said how long was left but not, at a
 * glance across the table, whose. Wrapped around the picture it is the same
 * reading in the place you are already looking to see who is thinking.
 *
 * Its colour comes from the same helper the action panel uses, so a seat in its
 * time bank reads red there too rather than staying gold to the last second.
 */
function TimerRing({ pct, tone = "--color-highlight" }) {
  const left = Math.max(0, Math.min(100, pct));
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      // Just outside the face, and above it: the picture is a circle with its
      // own border, and the ring reads as a second one closing in.
      className="pointer-events-none absolute left-0 top-0 -translate-y-1/2 z-30
                 w-[var(--seat-avatar)] h-[var(--seat-avatar)] scale-[1.16] overflow-visible"
    >
      <circle
        cx="50" cy="50" r={RING_RADIUS}
        fill="none" strokeWidth="5"
        className="stroke-black/50"
      />
      <circle
        cx="50" cy="50" r={RING_RADIUS}
        fill="none" strokeWidth="5" strokeLinecap="round"
        // Starts at twelve o'clock and empties clockwise, the way every clock
        // anybody has ever read does.
        transform="rotate(-90 50 50)"
        strokeDasharray={RING_LENGTH}
        strokeDashoffset={RING_LENGTH * (1 - left / 100)}
        style={{ stroke: `var(${tone})` }}
        className="transition-[stroke-dashoffset] duration-1000 ease-linear"
      />
    </svg>
  );
}

export default function PlayerSeat({
  player, isMe, isActive, myCards, isWinner, winAmount, equity, outs,
  position, timerPct, timerTone, showdownEntry, faceDownAtShowdown, dimmed, topHalf,
  stats, onInspect, shine, raisedCards, compact = false,
  backers = [],
}) {
  const showBB = useGameStore((s) => s.showBB);
  const hideHand = useGameStore((s) => s.hideHand);
  const toggleBB = useGameStore((s) => s.toggleBB);
  const media = useMediaStore((s) => s.peers[player.user_id]);
  const myStream = useMediaStore((s) => (isMe && s.cameraOn ? s.localStream : null));
  // The picture always rides in the avatar circle, so a seat with a camera on is
  // the same shape as one without — and a camera coming up changes nothing about
  // the seat until there are frames to show. Your own stream first: what you are
  // sending is drawn from the stream itself, not from a connection to yourself.
  const facePeer = myStream
    ? { stream: myStream, video: true, status: "connected", videoFlowing: true }
    : media || null;
  // Whether the circle is showing a moving face rather than the avatar. Same
  // question SeatVideo asks itself; asked here because it decides whether the
  // avatar is drawn underneath at all.
  const cameraInCircle = Boolean(
    facePeer?.stream && facePeer.video
    && facePeer.videoFlowing !== false && facePeer.status !== "failed",
  );
  const bb = useGameStore((s) => s.level?.big_blind) || 0;
  const p = player;
  // Your own hand, between hands: the same offer the action panel's bar makes,
  // asked once so the two cannot disagree about whether you may show.
  const showOffer = useShowCardsOffer(isMe ? player.seat : null, isMe ? myCards : null);
  const money = useBountyMoney();
  const bountyFlash = useBountyFlash(p.seat);
  const bountyCents = p.bounty_cents || 0;
  // A mystery head. Once the pool is cut, every player still in carries an
  // envelope worth an unknown amount — which is the whole format, and the felt
  // said nothing about it: a mystery bounty puts no figure on a head, so the
  // badge beside this one is never drawn in one of these.
  const mysteryOpen = useGameStore((s) => Boolean(s.mystery?.opened));
  const mysteryTopCents = useGameStore((s) => s.mystery?.topLeftCents || 0);
  const carriesEnvelope = mysteryOpen && !p.is_eliminated && bountyCents <= 0;
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
      {/* What they just did. On the table-facing side of the seat — this column
          flips to the inner edge for the seats above the centre — because a
          hand is read across the felt, from the middle outwards. */}
      {!p.is_eliminated && <SeatActionPill seat={p.seat} />}
      {/* Back from a rebuy, at the table but not in the hand being dealt. The
          alternative was being invisible until the next one, which reads as a
          rebuy that did not work. */}
      {p.is_waiting && !p.is_eliminated && (
        <div className="bg-(--color-highlight-dim) text-(--color-highlight-pale) text-[10px] font-bold px-1.5 py-0.5 rounded border border-(--color-highlight-edge) text-center">
          WAITING
        </div>
      )}
      {/* Who on the rail has called this seat to take it. A side bet is worth
          nothing but being right, and being seen to have called it is most of
          that — so it goes on the seat, not only in the panel. */}
      {backers.length > 0 && (
        <div
          title={`${backers.map((one) => one.name).join(", ")} ${backers.length === 1 ? "is" : "are"} on ${p.name}`}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none
                     bg-black/60 border border-(--color-border) text-(--color-silver)"
        >
          <span aria-hidden="true">👍</span>
          {backers.length}
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
      {/* Under the percentage, and only when you are behind: what the number is
          made of. The server sends outs for nobody who is in front. */}
      {!isWinner && <OutsBubble outs={outs} />}
    </div>
  );

  // Three ways a hand stops being yours alone: turned over at showdown, laid
  // face up for an all-in runout, or shown on purpose between hands. Once the
  // table has seen it, covering it hides it from nobody but its owner — and
  // leaves you hovering your own cards to read a showdown everybody else is
  // already looking at.
  const handIsPublic = Boolean(showdownEntry) || equity !== null || Boolean(raisedCards?.length);
  // Your own cards, face down until you point at them. What you hold and what
  // it adds up to are the same secret — leaving "Two pair, aces and kings"
  // legible under a pair of card backs would be covering the cards and reading
  // them out — so the label lifts with them. The cards alone are what lifts
  // them, though: see `peer/hand` in HoleCards.
  // Folding does not empty the room behind you. The mucked hand is left on the
  // seat at a fifteenth of its opacity, which is a reminder to you and a
  // readable pair of cards to anybody looking over your shoulder — so the cover
  // stays on until the hand is public, and the folded cards lift on the same
  // hover as the live ones.
  const coverHand = isMe && hideHand && !handIsPublic;
  const cards = (
    // Cards and label in a column, the buttons beside it rather than inside
    // it: what the hand adds up to sits over the cards and never shares a line
    // with the button that says "nh".
    <div key="cards" className="flex items-start gap-1">
      {/* Reversed rather than reordered. The label reads better above the cards
          — it is the first thing you look for and the cards are what you check
          it against — but it also has to stay after them in the DOM, since what
          reveals it when you hover your own hand is a sibling selector on the
          cards. */}
      <div className="flex flex-col-reverse items-start gap-1">
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
        hideUntilHover={coverHand}
        // Your own cards are how you show them — the same offer the bar in the
        // action panel makes, through the same hook. Pick one or both at any
        // point in the hand, mucking included, since reaching for the cards is
        // when a player decides to flash one; the reveal itself waits for the
        // hand to be over, so nobody still deciding learns anything from it.
        // Null for everybody else's seat.
        onShowCards={showOffer.canShow ? showOffer.show : null}
        // Whether pressing Show turns them over now or asks for the end of the
        // hand, what has already been asked for, and how to take it back.
        showDeferred={!showOffer.betweenHands}
        pendingShow={showOffer.pending}
        onCancelShow={showOffer.cancel}
        // On a phone every seat shrinks; the hero keeps board-sized cards,
        // since that is the one hand you actually have to read.
        size={compact && isMe ? "board" : "seat"}
      />
      {showdownEntry && !faceDownAtShowdown && (
        <div className={`text-[10px] font-semibold px-1.5 py-0.5 rounded text-center ${
          isWinner ? "text-(--color-highlight-text)" : "text-(--color-text-muted)"
        }`}>
          {showdownEntry.hand_name}
        </div>
      )}
      </div>
      {/* Only at your own seat — you can only speak for yourself — and not on a
          phone, where the seat has no room beside the cards for it and the bar
          across the top carries the same list. Outside the column on purpose:
          inside it, reaching for "nh" turned your own cards face up. */}
      {isMe && !compact && <SeatQuickChat />}
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
        // so this is only the rest of the way clear of it. Tighter on a phone,
        // where the name has sixty points to live in and every one the picture
        // does not need is one more character of somebody's name.
        paddingLeft: `calc(var(--seat-avatar) * ${compact ? 0.5 : 0.62})`,
        // At least as deep as the half of the picture that overlaps it, so the
        // circle never hangs below the plate it is supposed to be sitting on —
        // and so the name has room above and below it either way.
        minHeight: "calc(var(--seat-avatar) * 0.5)",
      }}
      className={`relative bg-[linear-gradient(160deg,var(--color-surface-raised),var(--color-surface-sunken))]
                   rounded-lg border-2 ${borderColor} w-full shadow-lg shadow-black/50
                   flex items-center text-left cursor-pointer
                   hover:border-(--color-border-strong) transition-colors ${
        compact ? "pr-1 py-0.5 gap-1" : "pr-2 py-1.5 gap-2"
      }`}>
      {/* What this seat is worth to whoever busts them — pinned to the plate
          rather than tucked inside it, because it is a price on a head and not
          another stat. Gone once they are out: the bounty went with them, to
          whoever collected it. */}
      {bountyCents > 0 && !p.is_eliminated && (
        <span
          key={bountyFlash?.id || "bounty"}
          title={`${p.name} is worth ${money(bountyCents)} to whoever knocks them out`}
          className={`absolute -top-2 -right-1 z-10 px-1.5 py-px rounded-full text-[10px] font-extrabold leading-none
                      bg-[linear-gradient(135deg,var(--color-highlight-bright),var(--color-highlight-deep))]
                      text-(--color-highlight-ink) border border-(--color-highlight-deeper)
                      shadow shadow-black/60 whitespace-nowrap
                      ${bountyFlash ? "animate-bounty-bump" : ""}`}
        >
          {money(bountyCents)}
        </span>
      )}

      {/* The envelope on their head. No number on it, because there is not one
          to know — that is what makes it worth chasing. It lands with a pop the
          moment the pool opens, and goes with them when they bust. */}
      {carriesEnvelope && (
        <span
          title={`${p.name} is worth a mystery envelope`
            + (mysteryTopCents > 0 ? ` — up to ${money(mysteryTopCents)}` : "")}
          className="animate-mystery-head absolute -top-2 -right-1 z-10 flex items-center gap-0.5
                     px-1.5 py-px rounded-full text-[10px] font-extrabold leading-none
                     bg-[linear-gradient(135deg,var(--color-highlight-bright),var(--color-highlight-deep))]
                     text-(--color-highlight-ink) border border-(--color-highlight-deeper)
                     shadow shadow-black/60 whitespace-nowrap"
        >
          <span aria-hidden="true">✉️</span>
          <span>?</span>
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
            KO +{money(bountyFlash.cashCents)}
          </span>
          <span className="block text-[8px] font-semibold leading-tight opacity-80">
            {bountyFlash.toHeadCents > 0
              ? `${money(bountyFlash.toHeadCents)} onto their head`
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
        <div className={`font-semibold truncate text-(--color-silver) ${
          compact ? "text-[11px]" : "text-xs"
        }`}>{p.name}</div>
        {/* A notch bigger than the rest of the plate's small print: a stack is
            the number you read off somebody else's seat all night. */}
        <div className={`text-(--color-text-muted) ${compact ? "text-[11px]" : "text-[13px]"}`}>
          {p.is_eliminated ? (
            <span className="text-(--color-accent-link)">Out</span>
          ) : p.is_all_in && !p.is_waiting ? (
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
  // person rather than as a column of parts. This is also where the camera
  // goes — same circle, same place, whether it is a photo or a face that moves.
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
      {!cameraInCircle && (
        <Avatar url={p.avatar_url} emoji={p.avatar}
            border={p.avatar_border} name={p.name}
          className="w-full h-full"
          emojiClassName="text-[calc(var(--seat-avatar)*0.5)]" />
      )}
      {/* The camera, and nothing else, ever: a picture when frames are arriving
          and a hidden element for the sound when they are not. Never a box of
          its own — see SeatVideo. */}
      {facePeer && (
        <SeatVideo peer={facePeer} name={p.name}
          mirrored={!!myStream} muted={!!myStream} />
      )}
    </span>
  );

  // Outside the picture rather than inside it: the avatar clips its contents to
  // a circle, which would cut the ring in half.
  const faceTimer = isActive
    ? <TimerRing key="face-timer" pct={timerPct ?? 100} tone={timerTone} />
    : null;

  // Cards beside the avatar's upper half, plate under its lower half. The plate
  // is what sets where the seam is — the avatar is pinned to its top edge and
  // pulled up by half its own height — so the two rows meet at the middle of
  // the picture however tall the cards happen to be.
  const body = (
    <div key="body" className="w-full">
      <div className="flex items-end justify-start min-h-[calc(var(--seat-avatar)/2)]"
        style={{ paddingLeft: "calc(var(--seat-avatar) * 1.12)" }}>
        {cards}
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
        {faceTimer}
      </div>
    </div>
  );

  // Nothing is left for the outer edge: the picture lives in the circle and the
  // sound is played from there too, so a seat with a camera on is laid out
  // exactly like a seat without one.
  const stack = topHalf ? [body, badges] : [badges, body];

  // A phone has no room to spare: the seat ring runs down the long sides of the
  // screen, so a seat that grows sideways runs off it. The picture is still the
  // biggest thing in a seat there, just not as big as it gets on a table with
  // room around it.
  return (
    <div
      // The face is the anchor everything else in the seat is measured from,
      // so on a phone it is also what the name is competing with: the plate is
      // pushed clear of the circle twice over — once to slide out from under
      // it, once so the text starts past it — and at 2.75rem that was forty of
      // a hundred points gone before a letter was drawn.
      style={{ "--seat-avatar": compact ? (isMe ? "2.25rem" : "2rem") : "clamp(3.6rem,11.75cqw,6.25rem)" }}
      className={`relative flex flex-col items-center gap-1 transition-opacity duration-500 ${
        compact ? (isMe ? "w-[6.75rem]" : "w-[6.5rem]") : "w-[clamp(8.75rem,27cqw,15rem)]"
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
