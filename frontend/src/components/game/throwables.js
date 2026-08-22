/**
 * The things you can throw, and what they look like when they land.
 *
 * The ids are the server's (see backend/game/throwables.py) — it decides what
 * may be thrown; this decides what it looks like. A rose leaves a petal, a
 * snowball leaves a splash of white, and a chip just bounces.
 */
export const THROWABLES = [
  { id: "tomato", glyph: "🍅", label: "Tomato", splat: "💥", tint: "#c3565f", hit: "smear" },
  { id: "egg", glyph: "🥚", label: "Egg", splat: "💦", tint: "#e8e2d4", hit: "splash" },
  { id: "beer", glyph: "🍺", label: "Beer", splat: "💦", tint: "#e0c66b", hit: "splash" },
  { id: "chip", glyph: "🔴", label: "Chip", splat: "✨", tint: "#c3565f", hit: "sparkle" },
  { id: "shoe", glyph: "👟", label: "Shoe", splat: "💢", tint: "#b9b0a7", hit: "thud" },
  { id: "chicken", glyph: "🐔", label: "Chicken", splat: "🪶", tint: "#e0c66b", hit: "feathers" },
  { id: "rose", glyph: "🌹", label: "Rose", splat: "🌸", tint: "#c3565f", hit: "petals" },
  { id: "snowball", glyph: "⚪", label: "Snowball", splat: "❄️", tint: "#dbe6f0", hit: "frost" },
  // Bought with coins. What they cost is the server's business (see the shop);
  // this is only what they look like on the way over, and what they leave on
  // the screen of whoever caught them.
  { id: "banana", glyph: "🍌", label: "Banana", splat: "💦", tint: "#e0c66b", hit: "smear" },
  { id: "ice", glyph: "🧊", label: "Ice cube", splat: "❄️", tint: "#dbe6f0", hit: "frost" },
  { id: "water", glyph: "🪣", label: "Bucket of water", splat: "💦", tint: "#7fb3d5", hit: "splash" },
  { id: "coffee", glyph: "☕", label: "Coffee", splat: "💦", tint: "#8a6242", hit: "smear" },
  { id: "pie", glyph: "🥧", label: "Pie", splat: "💥", tint: "#e0c66b", hit: "smear" },
  { id: "fish", glyph: "🐟", label: "Fish", splat: "💦", tint: "#dbe6f0", hit: "splash" },
  { id: "duck", glyph: "🦆", label: "Duck", splat: "🪶", tint: "#e0c66b", hit: "feathers" },
  { id: "cake", glyph: "🎂", label: "Cake", splat: "💥", tint: "#e8c9d4", hit: "smear" },
  { id: "brick", glyph: "🧱", label: "Brick", splat: "💢", tint: "#c3565f", hit: "crack" },
  { id: "confetti", glyph: "🎉", label: "Confetti", splat: "✨", tint: "#e0c66b", hit: "petals" },
  // The one thing here that is not thrown. The cigar stays lit where you drew
  // it and the smoke crosses on its own, so it needs a trail rather than a
  // splat: see ThrownItem. Nothing lands, so nothing hits.
  { id: "cigar", glyph: "🚬", label: "Cigar", splat: "💨", tint: "#b9b0a7", smoke: "💨" },
  { id: "skull", glyph: "💀", label: "Skull", splat: "💀", tint: "#b9b0a7", hit: "drain" },
  { id: "bomb", glyph: "💣", label: "Bomb", splat: "💥", tint: "#c3565f", hit: "blast" },
  { id: "octopus", glyph: "🐙", label: "Octopus", splat: "⚫", tint: "#6b4a7a", hit: "ink" },
  { id: "lightning", glyph: "⚡", label: "Lightning", splat: "⚡", tint: "#e8dc6b", hit: "blast" },
  { id: "crown", glyph: "👑", label: "Crown", splat: "✨", tint: "#e0c66b", hit: "sparkle" },
  { id: "anvil", glyph: "🪨", label: "Anvil", splat: "💢", tint: "#b9b0a7", hit: "crack" },
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

/**
 * Where along that arc a throw is, as an offset from where it started.
 *
 * The same quadratic the aim line draws, so smoke laid down along the path
 * lands on the dashes a player was pointing at rather than beside them. `t`
 * runs 0 at the thrower to 1 at the target.
 */
export function throwPoint(dx, dy, t) {
  const control = dy / 2 - throwLift(dx) * 2;
  return { x: dx * t, y: 2 * (1 - t) * t * control + t * t * dy };
}

/**
 * The order the picker at the table shows them in.
 *
 * What you own first, in the order above; what you do not, after. At the table
 * the question is "what can I throw at them right now", and with twenty-five
 * things on the shelf the answer was scattered through seven rows of mostly
 * padlocked ones. The shop is where you go to browse — see lobby/shopShelf.js,
 * which orders by price for exactly the opposite reason.
 *
 * `owns` is asked rather than read off the item, because ownership belongs to
 * the wallet and this list belongs to the client.
 */
export function pickerOrder(owns) {
  const mine = THROWABLES.filter((item) => owns(item.id));
  const rest = THROWABLES.filter((item) => !owns(item.id));
  return [...mine, ...rest];
}
