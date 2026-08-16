/**
 * The things you can throw, and what they look like when they land.
 *
 * The ids are the server's (see backend/game/throwables.py) — it decides what
 * may be thrown; this decides what it looks like. A rose leaves a petal, a
 * snowball leaves a splash of white, and a chip just bounces.
 */
export const THROWABLES = [
  { id: "tomato", glyph: "🍅", label: "Tomato", splat: "💥", tint: "#c3565f" },
  { id: "egg", glyph: "🥚", label: "Egg", splat: "💦", tint: "#e8e2d4" },
  { id: "beer", glyph: "🍺", label: "Beer", splat: "💦", tint: "#e0c66b" },
  { id: "chip", glyph: "🔴", label: "Chip", splat: "✨", tint: "#c3565f" },
  { id: "shoe", glyph: "👟", label: "Shoe", splat: "💢", tint: "#b9b0a7" },
  { id: "chicken", glyph: "🐔", label: "Chicken", splat: "🪶", tint: "#e0c66b" },
  { id: "rose", glyph: "🌹", label: "Rose", splat: "🌸", tint: "#c3565f" },
  { id: "snowball", glyph: "⚪", label: "Snowball", splat: "❄️", tint: "#dbe6f0" },
  // Bought with coins. What they cost is the server's business (see the shop);
  // this is only what they look like on the way over.
  { id: "banana", glyph: "🍌", label: "Banana", splat: "💦", tint: "#e0c66b" },
  { id: "ice", glyph: "🧊", label: "Ice cube", splat: "❄️", tint: "#dbe6f0" },
  { id: "pie", glyph: "🥧", label: "Pie", splat: "💥", tint: "#e0c66b" },
  { id: "fish", glyph: "🐟", label: "Fish", splat: "💦", tint: "#dbe6f0" },
  { id: "brick", glyph: "🧱", label: "Brick", splat: "💢", tint: "#c3565f" },
  { id: "bomb", glyph: "💣", label: "Bomb", splat: "💥", tint: "#c3565f" },
  { id: "crown", glyph: "👑", label: "Crown", splat: "✨", tint: "#e0c66b" },
];

const BY_ID = Object.fromEntries(THROWABLES.map((item) => [item.id, item]));

/** Never null: an id from a newer client than this one still has to draw. */
export function throwableFor(id) {
  return BY_ID[id] || THROWABLES[0];
}

/**
 * How high a throw rises over the distance it covers.
 *
 * Enough of an arc to read as thrown rather than slid, and more of it the
 * further it goes — a lob across the table, a flick to the seat beside you.
 * Shared so the line you aim along is the line the object actually flies.
 */
export function throwLift(dx) {
  return Math.min(90, 26 + Math.abs(dx) * 0.18);
}
