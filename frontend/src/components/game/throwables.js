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
];

const BY_ID = Object.fromEntries(THROWABLES.map((item) => [item.id, item]));

/** Never null: an id from a newer client than this one still has to draw. */
export function throwableFor(id) {
  return BY_ID[id] || THROWABLES[0];
}
