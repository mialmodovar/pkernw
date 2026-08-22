/**
 * The rings people buy to put around their face.
 *
 * Eight of them, and what makes one worth 900 coins rather than 150 is how hard
 * it is to miss from across a table: a thin silver ring reads as taste, a
 * rainbow reads as somebody who has been playing for a month.
 *
 * Drawn rather than fetched, like everything else here — each one is a gradient
 * and a glow, so the whole set costs nothing to ship and nothing to load. The
 * ids are the server's (see backend/sidegames/borders.py): it decides which
 * exist and who owns one, because a border is drawn on other people's screens.
 *
 * Pure data plus one lookup, so the seat, the lobby row and the shop tile all
 * draw the same ring from the same place.
 */

// The plain ring the app has always drawn, and what everybody starts with.
export const NO_BORDER = "";

export const BORDERS = [
  {
    id: "silver",
    label: "Silver",
    ring: "linear-gradient(140deg, #e9e4dd, #8d8880 60%, #cfc9c1)",
    glow: "rgba(220, 214, 206, 0.35)",
  },
  {
    id: "copper",
    label: "Copper",
    ring: "linear-gradient(140deg, #e0a06a, #8a4f28 60%, #d08b52)",
    glow: "rgba(214, 141, 84, 0.35)",
  },
  {
    id: "emerald",
    label: "Emerald",
    ring: "linear-gradient(140deg, #7ce0a8, #12693f 60%, #4fc888)",
    glow: "rgba(60, 190, 125, 0.4)",
  },
  {
    id: "sapphire",
    label: "Sapphire",
    ring: "linear-gradient(140deg, #7db4f0, #17407f 60%, #4d8ede)",
    glow: "rgba(70, 130, 220, 0.4)",
  },
  {
    id: "crimson",
    label: "Crimson",
    ring: "linear-gradient(140deg, #f08a8a, #8c1220 60%, #d64457)",
    glow: "rgba(210, 60, 80, 0.4)",
  },
  {
    id: "violet",
    label: "Violet",
    ring: "linear-gradient(140deg, #c79bf0, #4a1f80 60%, #9b62d8)",
    glow: "rgba(150, 90, 215, 0.4)",
  },
  {
    id: "gold",
    label: "Gold",
    ring: "linear-gradient(140deg, #ffe9a8, #a67c15 55%, #ffd968)",
    glow: "rgba(230, 190, 90, 0.5)",
  },
  {
    id: "rainbow",
    label: "Rainbow",
    // The one that moves. Kept to a slow turn rather than a flash: it is worn
    // all evening, at a table people are trying to read.
    ring: "conic-gradient(#f0736b, #f0c46b, #7ce08c, #6bc7f0, #b98cf0, #f0736b)",
    glow: "rgba(255, 255, 255, 0.35)",
    spins: true,
  },
];

const BY_ID = Object.fromEntries(BORDERS.map((one) => [one.id, one]));

/** The ring with this id, or null for the plain one — and for an id from a
 *  newer server than this client, which draws the plain one rather than
 *  guessing. */
export function borderFor(id) {
  return BY_ID[id] || null;
}

/**
 * The style for the ring around a face, given its thickness in pixels.
 *
 * A padded box with the gradient as its background and the face sitting in the
 * middle of it: a border-image cannot be rounded, and four separate border
 * colours cannot be a gradient at all.
 */
export function ringStyle(id, width = 2) {
  const border = borderFor(id);
  if (!border) return null;
  return {
    padding: `${width}px`,
    background: border.ring,
    boxShadow: `0 0 ${width * 3}px ${border.glow}`,
  };
}
