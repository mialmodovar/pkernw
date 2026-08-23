import useThemeStore from "../../store/themeStore";
import { CARD_BACK, CARD_WINNING, deckFace, parseCard } from "./cardStyles";

/** The four suits, drawn rather than typed.
 *
 * The unicode glyphs render differently on every platform — thin on Windows,
 * heavy on macOS, sometimes as emoji on Android — and at 12px that is the
 * difference between reading a hand and squinting at it. These are one path
 * each, so they are identical everywhere and scale without going fuzzy.
 */
const SUIT_PATH = {
  "♠": "M12 2C12 2 4 8.5 4 13.2 4 16 6 17.8 8.3 17.8c1.2 0 2.2-.5 2.9-1.3-.2 2-.9 3.4-2.2 4.5h6c-1.3-1.1-2-2.5-2.2-4.5.7.8 1.7 1.3 2.9 1.3C18 17.8 20 16 20 13.2 20 8.5 12 2 12 2z",
  "♥": "M12 21.4S3 15.2 3 9.4C3 6.4 5.2 4.3 7.9 4.3c1.7 0 3.2.9 4.1 2.3.9-1.4 2.4-2.3 4.1-2.3C18.8 4.3 21 6.4 21 9.4c0 5.8-9 12-9 12z",
  "♦": "M12 2.2 20.2 12 12 21.8 3.8 12z",
  "♣": "M12 2.3a4 4 0 0 0-3.2 6.4A4 4 0 1 0 7.6 16.4c.9 0 1.7-.3 2.4-.8-.2 2-.9 3.4-2.2 4.5h8.4c-1.3-1.1-2-2.5-2.2-4.5.7.5 1.5.8 2.4.8a4 4 0 1 0-1.2-7.7A4 4 0 0 0 12 2.3z",
};

export function Suit({ suit, className = "" }) {
  const path = SUIT_PATH[suit];
  if (!path) return <span className={className}>{suit}</span>;
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
      className={`shrink-0 ${className}`}>
      <path d={path} />
    </svg>
  );
}

// Two sizes, because the two places cards appear want different things. On the
// board there is room for a proper card — a corner index and a large pip. In a
// seat there is room for a rank and a suit, and anything more turns to mush.
const SIZE = {
  // The same card on a phone, where five of them plus the pot have to fit
  // between two seats that are 100px wide each. At the old floor the board was
  // 55% of the width of the screen and the side seats were sitting on it.
  boardCompact: {
    box: "w-[clamp(1.75rem,6.35cqw,4.14rem)] h-[clamp(2.44rem,8.83cqw,5.8rem)]",
    // The rank and the pip shrink with the card rather than staying the size
    // they were, which is what would have burst it. No corner index: there is
    // no room for one, and it is hidden below md anyway.
    rank: "text-[clamp(1.15rem,3.2cqw,1.86rem)]",
    pip: "w-[clamp(1rem,2.7cqw,1.58rem)] h-[clamp(1rem,2.7cqw,1.58rem)]",
  },
  board: {
    box: "w-[clamp(2.48rem,6.35cqw,4.14rem)] h-[clamp(3.46rem,8.83cqw,5.8rem)]",
    rank: "text-[1.86rem]",
    pip: "w-[1.58rem] h-[1.58rem]",
    corner: "text-[0.83rem]",
    cornerPip: "w-[0.7rem] h-[0.7rem]",
  },
  seat: {
    box: "w-[clamp(1.52rem,4.97cqw,3.31rem)] h-[clamp(2.14rem,7.04cqw,4.69rem)]",
    rank: "text-[1.45rem]",
    pip: "w-[1.18rem] h-[1.18rem]",
    corner: null,   // no room; the centred rank is the index
    cornerPip: null,
  },
};

export function CardBack({ size = "seat", className = "" }) {
  const s = SIZE[size];
  return (
    <div className={`${s.box} flex items-center justify-center ${CARD_BACK} ${className}`}>
      <Suit suit="♠" className="w-3 h-3 opacity-60" />
    </div>
  );
}

export default function PlayingCard({ card, size = "seat", winning, shine, className = "", style }) {
  // How this player has their deck printed. Read here rather than passed down:
  // every card on the felt asks the same question, and threading it through the
  // board, the seats and the replays would be the same answer written eleven
  // times.
  const deck = useThemeStore((s) => s.deck);
  const parsed = typeof card === "string" ? parseCard(card) : card;
  if (!parsed) return <CardBack size={size} className={className} />;

  const s = SIZE[size];
  const printed = deckFace(deck, parsed.suit);

  return (
    <div
      className={`${s.box} ${printed.face} ${winning ? CARD_WINNING : ""} ${shine ? "animate-card-glow" : ""} relative flex flex-col
                  items-center justify-center leading-none ${className}`}
      style={{ ...printed.style, ...style }}
    >
      {/* The sheen is clipped to the card and sits over the pips, so it reads as
          light crossing the face rather than a shape drawn on it. */}
      {shine && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[4px]">
          <span className="absolute inset-y-0 left-0 w-1/2 animate-card-sheen
                           bg-[linear-gradient(100deg,transparent,rgba(255,246,214,0.85),transparent)]" />
        </span>
      )}
      {s.corner && (
        // No room for a corner index on a phone; the centred rank is the index.
        <span className={`absolute top-[2px] left-[3px] hidden md:flex flex-col items-center gap-[1px] font-black ${s.corner}`}>
          {parsed.rank}
          <Suit suit={parsed.suit} className={s.cornerPip} />
        </span>
      )}
      <span className={`font-black tracking-tight ${s.rank}`}>{parsed.rank}</span>
      <Suit suit={parsed.suit} className={`${s.pip} mt-[1px]`} />
    </div>
  );
}
