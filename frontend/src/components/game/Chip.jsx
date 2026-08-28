/**
 * A casino chip, drawn rather than written.
 *
 * The blackjack bet is built by pressing chips, and the whole reason to do it
 * that way instead of typing a number is that a chip is a physical thing you
 * recognise before you read it. That only works if it looks like one: the
 * milled edge spots are what separates a chip from a coloured circle, and the
 * colours are the ones every casino uses — red at five, green at twenty-five,
 * black at a hundred — because a player who has seen a table before already
 * knows what they are worth before the number resolves.
 *
 * SVG on one 100×100 grid, so a chip is the same drawing at 28px in a stack
 * and at 64px under a thumb, and it is the same file for both. The app's own
 * coin icon (see components/icons/glyphs.js) is deliberately not reused here:
 * that one is the wallet's mark and it follows the theme, and these have to be
 * the three colours that mean these three amounts.
 */

// The face and the edge, per denomination. `ring` is the milled edge, `face`
// the body, and `ink` whatever has to stay readable on top of it.
const LOOK = {
  5: { face: "#8f2233", ring: "#c3565f", ink: "#f6e3e6" },
  25: { face: "#1f5c3d", ring: "#4f9b6f", ink: "#e2f2e8" },
  100: { face: "#1c1a22", ring: "#c9b48a", ink: "#f0e4cb" },
};

// Where the milled spots sit. Six is what the edge of a real chip carries and
// it is the count that still reads as an edge pattern at 28px — eight turns to
// a dotted line and four looks like a mistake.
const SPOTS = [0, 60, 120, 180, 240, 300];

/**
 * One chip.
 *
 * `value` picks the look and is what is printed on it. Anything not on the
 * shelf falls back to the hundred, which is the plainest of the three — a chip
 * with no colour at all would be the one thing on the table that says nothing.
 */
export default function Chip({ value, size = 44, className = "", dim = false, ...rest }) {
  const look = LOOK[value] || LOOK[100];
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`shrink-0 ${dim ? "opacity-40" : ""} ${className}`}
      role="img"
      aria-label={`${value} coins`}
      {...rest}
    >
      {/* The body, and a darker rim under it so the chip has an edge rather
          than floating on the felt. */}
      <circle cx="50" cy="50" r="48" fill="rgba(0,0,0,0.45)" />
      <circle cx="50" cy="50" r="46" fill={look.face} />

      {/* The milling. Each spot is a wedge of the lighter tone laid over the
          rim — the way the stripes on a chip are inlaid rather than painted. */}
      {SPOTS.map((angle) => (
        <rect
          key={angle}
          x="43" y="1" width="14" height="15" rx="3"
          fill={look.ring}
          transform={`rotate(${angle} 50 50)`}
        />
      ))}

      {/* The inlay: the printed face a denomination is struck into. */}
      <circle cx="50" cy="50" r="33" fill="none" stroke={look.ring} strokeWidth="2.5" />
      <circle cx="50" cy="50" r="30" fill="rgba(0,0,0,0.22)" />

      <text
        x="50" y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fill={look.ink}
        // Sized off the digit count rather than fixed: "100" in the size that
        // suits "5" runs off the inlay.
        fontSize={String(value).length > 2 ? 27 : 34}
        fontWeight="700"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        letterSpacing="-1"
      >
        {value}
      </text>
    </svg>
  );
}

/**
 * A bet, as a short row of chips laid over each other.
 *
 * What sits in front of a hand rather than what sits in the betting circle: it
 * has to be small, it has to read as chips, and it has to survive a stake of
 * 500 without becoming ten discs. Overlapping to the right is how a dealer
 * spreads a stack to be counted, and past four it stops and says how many more
 * — which is also what a dealer does.
 */
export function ChipFan({ chips = [], size = 20, max = 4, className = "" }) {
  if (!chips.length) return null;
  const shown = chips.slice(0, max);
  const rest = chips.length - shown.length;
  return (
    <span className={`inline-flex items-center ${className}`}>
      {shown.map((value, index) => (
        <span key={index} style={{ marginLeft: index === 0 ? 0 : -size * 0.42 }}>
          <Chip value={value} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span className="ml-1 text-[10px] font-semibold text-(--color-text-muted) tabular-nums">
          +{rest}
        </span>
      )}
    </span>
  );
}

/**
 * A bet, as the pile of chips that makes it.
 *
 * Overlapped and stacked upwards, which is how chips sit on felt and also the
 * only way a pile of eight fits where a row of eight would not. The newest is
 * drawn last so it lands on top of the rest — the chip you just pressed is the
 * one that should move.
 */
export function ChipStack({ chips = [], size = 34, className = "" }) {
  if (!chips.length) return null;
  return (
    <span
      className={`relative inline-block ${className}`}
      style={{ width: size, height: size + (chips.length - 1) * 7 }}
    >
      {chips.map((value, index) => (
        <span
          key={index}
          className="absolute left-0 animate-bj-chip"
          style={{
            bottom: index * 7,
            // Each chip lands after the one under it, so a bet of four reads
            // as four chips going down rather than a block appearing.
            animationDelay: `${index * 55}ms`,
            zIndex: index,
          }}
        >
          <Chip value={value} size={size} />
        </span>
      ))}
    </span>
  );
}
