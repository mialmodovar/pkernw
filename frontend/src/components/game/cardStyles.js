// The standard four-colour deck. The previous copper and muted green read as
// near-black at table size, which is the whole point of a four-colour deck —
// telling the suits apart at a glance. These are dialled down from primaries so
// they still sit on an ivory card without shouting.
export const SUIT_COLOR = {
  "♥": "#c1121f", // red
  "♦": "#1f4fd8", // blue
  "♣": "#12813f", // green
  "♠": "#14161a", // black
};

export const SUIT_CHAR = { h: "♥", d: "♦", c: "♣", s: "♠", "♥": "♥", "♦": "♦", "♣": "♣", "♠": "♠" };

// A card, not a rectangle: warm ivory with a soft top-light, a fine edge and a
// grounded shadow, so it reads as an object lying on the felt.
export const CARD_FACE =
  "rounded-[4px] bg-[linear-gradient(163deg,#fdfbf7_0%,#f2ece2_55%,#e4dbcd_100%)] " +
  "border border-[#c9bfae] " +
  "shadow-[0_2px_5px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.95)]";

// Face-down — a woven burgundy back with a silver edge, so a covered hand still
// looks like a card rather than a dark gap.
export const CARD_BACK =
  "rounded-[4px] border border-[rgba(214,199,190,0.45)] text-[rgba(224,210,200,0.55)] " +
  "bg-[repeating-linear-gradient(45deg,#5e1523_0_3px,#4a1019_3px_6px)] " +
  "shadow-[0_2px_5px_rgba(0,0,0,0.55),inset_0_0_0_1px_rgba(0,0,0,0.35)]";

// Ring on the five cards that made the winning hand at showdown.
export const CARD_WINNING =
  "ring-2 ring-[#d4af37] ring-offset-1 ring-offset-black/50 shadow-[0_0_12px_rgba(212,175,55,0.5)]";
