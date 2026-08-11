// Shared card styling — muted 4-colour deck that fits the dark red / black / silver theme.
export const SUIT_COLOR = {
  "♥": "#b3243a", // red
  "♦": "#a8632c", // copper
  "♣": "#2f5d4a", // deep muted green
  "♠": "#161616", // black
};

export const SUIT_CHAR = { h: "♥", d: "♦", c: "♣", s: "♠", "♥": "♥", "♦": "♦", "♣": "♣", "♠": "♠" };

// Warm off-white face with a silver edge, rather than flat pure white.
export const CARD_FACE =
  "bg-[#efe9e3] border border-[#b9b0a7] shadow-[0_2px_6px_rgba(0,0,0,0.5)]";

// Face-down / unknown card — dark burgundy back.
export const CARD_BACK =
  "bg-[linear-gradient(140deg,#5a1420,#2a0d12)] border border-[rgba(196,178,165,0.35)] text-[rgba(214,199,190,0.8)]";
