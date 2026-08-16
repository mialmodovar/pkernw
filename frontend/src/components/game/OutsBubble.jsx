import { SUIT_COLOR, parseCard } from "./cardStyles";

/** Enough to read at a glance. The rest is a number and a tooltip — a run of
 *  nine little cards on a seat is a wall, and you already know it is the
 *  hearts by the time you have seen three of them. */
const SHOWN = 4;

/**
 * What you are drawing to, beside what it is worth.
 *
 * The equity badge says 18%; it does not say what you are rooting for, and
 * "eight outs, all hearts" is how anybody actually holds a draw in their head
 * while the turn is being dealt. Only ever shown to a player who is behind —
 * a hand in front is not drawing to anything — and only on your own seat,
 * because it is your own draw you are counting.
 *
 * The cards are the server's: it has the evaluator, so the list already knows
 * that the heart which pairs the board and gives somebody quads is not an out.
 */
export default function OutsBubble({ outs }) {
  if (!outs?.length) return null;
  const shown = outs.slice(0, SHOWN);
  const rest = outs.length - shown.length;

  return (
    <div
      title={`${outs.length} card${outs.length === 1 ? "" : "s"} still win it for you: ${outs.join(" ")}`}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded-full whitespace-nowrap
                 bg-black/70 border border-(--color-border) shadow shadow-black/50"
    >
      <span className="text-[10px] font-extrabold leading-none text-(--color-highlight-text)">
        {outs.length}
      </span>
      <span className="text-[8px] font-bold uppercase tracking-wide leading-none text-(--color-text-muted)">
        {outs.length === 1 ? "out" : "outs"}
      </span>
      {shown.map((card) => {
        const parsed = parseCard(card);
        if (!parsed) return null;
        return (
          // A chip of ivory with the pip on it, rather than the card itself:
          // at this size a real card is a smudge, and all that has to survive
          // is the rank and the colour of the suit.
          <span
            key={card}
            style={{ color: SUIT_COLOR[parsed.suit] }}
            className="px-0.5 rounded-[2px] bg-[#f2ece2] text-[9px] font-bold leading-[1.15]"
          >
            {parsed.rank}{parsed.suit}
          </span>
        );
      })}
      {rest > 0 && (
        <span className="text-[9px] font-semibold leading-none text-(--color-text-muted)">
          +{rest}
        </span>
      )}
    </div>
  );
}
