/**
 * The app's own icons, as path data.
 *
 * Every one of these replaces an emoji. Emoji were never really ours: they are
 * a different drawing on every operating system, they carry a colour we cannot
 * change, and that last one matters here more than anywhere — the whole theme
 * system works by re-setting CSS variables, so a themed app with a fixed-colour
 * gold coin in the corner is a themed app with one thing in it that will not
 * follow.
 *
 * The style is engraving: one stroke weight for the shape, a lighter second
 * tone for the ornament inside it, the way a chip is milled or a card back is
 * printed. Nothing here is filled solid except the small ornaments, so an icon
 * reads at 14px as a silhouette and at 40px as a drawing.
 *
 * Path data rather than components, because that is the part worth testing and
 * the part worth keeping honest: one grid (24×24), one stroke width, and a name
 * that says what the thing is rather than what it looks like. `Icon.jsx` is the
 * only file that turns any of this into markup.
 *
 * Each path is {d, kind, transform?}:
 *   line   — the shape, drawn in the current colour
 *   fill   — a solid ornament in the current colour
 *   accent — the engraved detail, a lighter tone (or gold, see Icon.jsx)
 */

export const VIEWBOX = "0 0 24 24";

/** The suit pip that sits at the middle of the coin and the brand card. */
const SPADE = "M12 8.9c-1.7 1.6-3.2 2.5-3.2 4a1.7 1.7 0 0 0 2.8 1.3c-.1.8-.4 1.4-1 1.8h2.8c-.6-.4-.9-1-1-1.8a1.7 1.7 0 0 0 2.8-1.3c0-1.5-1.5-2.4-3.2-4z";

/** Eight spokes, drawn from the hub out to the rim. */
function spokes(inner, outer) {
  return Array.from({ length: 8 }, (_, index) => {
    const angle = (index * Math.PI) / 4;
    const round = (value) => Math.round(value * 100) / 100;
    const x1 = round(12 + Math.cos(angle) * inner);
    const y1 = round(12 + Math.sin(angle) * inner);
    const x2 = round(12 + Math.cos(angle) * outer);
    const y2 = round(12 + Math.sin(angle) * outer);
    return { d: `M${x1} ${y1}L${x2} ${y2}`, kind: "line" };
  });
}

/**
 * A place on the podium: a disc on a ribbon, ranked by the pips struck into it.
 *
 * The rank is engraved rather than written, because a numeral at sixteen pixels
 * is a smudge — and because three of these sit in a row, where counting pips is
 * quicker than reading digits. Colour still does most of the work; the pips are
 * what survives a theme that makes gold and bronze neighbours.
 */
function medal(rank) {
  // The pips sit in a row across the disc. One is centred; two and three spread
  // either side of centre, which is why the row is measured from the middle
  // rather than laid out from the left.
  const pips = Array.from({ length: rank }, (_, index) => {
    const x = Math.round((12 + (index - (rank - 1) / 2) * 3.2) * 10) / 10;
    return { d: `M${x} 12.6l1.3 1.7-1.3 1.7-1.3-1.7z`, kind: "fill" };
  });
  return [
    { d: "M8.2 3.2l2.9 5.6", kind: "line" },
    { d: "M15.8 3.2l-2.9 5.6", kind: "line" },
    { d: "M12 21.4a7.1 7.1 0 1 1 0-14.2 7.1 7.1 0 0 1 0 14.2z", kind: "line" },
    ...pips,
  ];
}

export const GLYPHS = {
  /* The most repeated mark in the app: a milled chip, not a coin. Four notches
     at the quarters are what tells one from the other at a glance. */
  coin: {
    label: "Coins",
    paths: [
      { d: "M12 21.4a9.4 9.4 0 1 1 0-18.8 9.4 9.4 0 0 1 0 18.8z", kind: "line" },
      { d: "M12 2.6v2.3", kind: "line" },
      { d: "M12 19.1v2.3", kind: "line" },
      { d: "M2.6 12h2.3", kind: "line" },
      { d: "M19.1 12h2.3", kind: "line" },
      { d: "M12 17.9a5.9 5.9 0 1 1 0-11.8 5.9 5.9 0 0 1 0 11.8z", kind: "accent" },
      { d: "M12 9.4l2.2 2.6-2.2 2.6-2.2-2.6z", kind: "fill" },
    ],
  },

  /* Tournaments. A cup with handles, because the trophy emoji it replaces is
     the one glyph everybody already reads as "the night somebody won". */
  trophy: {
    label: "Tournaments",
    paths: [
      { d: "M8 4h8v3.6a4 4 0 0 1-8 0z", kind: "line" },
      { d: "M8 5.6H5.8a2.4 2.4 0 0 0 2.5 3.5", kind: "line" },
      { d: "M16 5.6h2.2a2.4 2.4 0 0 1-2.5 3.5", kind: "line" },
      { d: "M12 11.6v3.2", kind: "line" },
      { d: "M9.9 14.8h4.2l.9 3.9H9z", kind: "line" },
      { d: "M8.4 18.7h7.2", kind: "line" },
      { d: "M12 5.4l1.1 1.4-1.1 1.4-1.1-1.4z", kind: "accent" },
    ],
  },

  /* Spin n Go. The wheel and the pointer above it — the draw is the format. */
  spin: {
    label: "Spin n Go",
    paths: [
      { d: "M12 21.2a9.2 9.2 0 1 1 0-18.4 9.2 9.2 0 0 1 0 18.4z", kind: "line" },
      ...spokes(3.4, 9.2),
      { d: "M12 14.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z", kind: "accent" },
      { d: "M12 1.2l1.7 2.9h-3.4z", kind: "fill" },
    ],
  },

  /* Sit n Go: two hands facing each other across the table, which is what a
     heads-up game looks like from above. Crossed sabres were the obvious
     drawing and the wrong one — at sixteen pixels they are an X, and the app
     already has an X that means close. */
  duel: {
    label: "Sit n Go",
    paths: [
      {
        d: "M4.6 6.8h5.6a1.3 1.3 0 0 1 1.3 1.3v7.8a1.3 1.3 0 0 1-1.3 1.3H4.6a1.3 1.3 0 0 1-1.3-1.3V8.1a1.3 1.3 0 0 1 1.3-1.3z",
        kind: "line",
        transform: "rotate(-11 7.4 12)",
      },
      {
        d: "M13.8 6.8h5.6a1.3 1.3 0 0 1 1.3 1.3v7.8a1.3 1.3 0 0 1-1.3 1.3h-5.6a1.3 1.3 0 0 1-1.3-1.3V8.1a1.3 1.3 0 0 1 1.3-1.3z",
        kind: "line",
        transform: "rotate(11 16.6 12)",
      },
      { d: "M7.4 10.4l1.4 1.8-1.4 1.8-1.4-1.8z", kind: "fill", transform: "rotate(-11 7.4 12)" },
      { d: "M16.6 10.4l1.4 1.8-1.4 1.8-1.4-1.8z", kind: "fill", transform: "rotate(11 16.6 12)" },
    ],
  },

  /* The app's own mark: a card with a rule inside it and a pip at the middle.
     It stands where the playing-card emoji used to, in the header and on a club
     that has not chosen a badge. */
  brand: {
    label: "HomeGame",
    paths: [
      { d: "M7.5 3.4h9a2 2 0 0 1 2 2v13.2a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V5.4a2 2 0 0 1 2-2z", kind: "line" },
      { d: "M7.9 5.9h8.2v12.2H7.9z", kind: "accent" },
      { d: SPADE, kind: "fill" },
    ],
  },

  "medal-1": { label: "First", paths: medal(1) },
  "medal-2": { label: "Second", paths: medal(2) },
  "medal-3": { label: "Third", paths: medal(3) },

  /* The mystery bounty: an envelope still under its seal. */
  envelope: {
    label: "Mystery bounty",
    paths: [
      { d: "M4 5.6h16a1.4 1.4 0 0 1 1.4 1.4v10a1.4 1.4 0 0 1-1.4 1.4H4a1.4 1.4 0 0 1-1.4-1.4V7A1.4 1.4 0 0 1 4 5.6z", kind: "line" },
      { d: "M3.2 6.6L12 12.8l8.8-6.2", kind: "accent" },
      { d: "M12 14.7a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4z", kind: "fill" },
    ],
  },

  /* The layout sandbox: a felt inside a frame. Drawn as the thing it opens
     rather than as a tool — a wrench would say something is broken, and a pair
     of dividers, which is what this was, reads as the letter A at button size. */
  tools: {
    label: "Table sandbox",
    paths: [
      { d: "M4.2 4.6h15.6a1.6 1.6 0 0 1 1.6 1.6v11.6a1.6 1.6 0 0 1-1.6 1.6H4.2a1.6 1.6 0 0 1-1.6-1.6V6.2a1.6 1.6 0 0 1 1.6-1.6z", kind: "line" },
      { d: "M12 16.4c-3.9 0-7-2-7-4.4s3.1-4.4 7-4.4 7 2 7 4.4-3.1 4.4-7 4.4z", kind: "accent" },
      { d: "M12 13.3a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6z", kind: "fill" },
    ],
  },

  check: {
    label: "Yes",
    paths: [{ d: "M4.8 12.4l4.8 4.8L19.2 6.8", kind: "line" }],
  },

  close: {
    label: "Close",
    paths: [
      { d: "M6.2 6.2l11.6 11.6", kind: "line" },
      { d: "M17.8 6.2L6.2 17.8", kind: "line" },
    ],
  },

  home: {
    label: "Lobby",
    paths: [
      { d: "M3.2 11.4L12 3.6l8.8 7.8", kind: "line" },
      { d: "M5.6 10.2v10.2h12.8V10.2", kind: "line" },
      { d: "M10.2 20.4v-5.2h3.6v5.2", kind: "accent" },
      { d: "M12 6.4l1.1 1.4-1.1 1.4-1.1-1.4z", kind: "fill" },
    ],
  },

  /* Clubs, drawn as the suit they are named after. */
  clubs: {
    label: "Clubs",
    paths: [
      { d: "M12 11.4a3 3 0 1 1 0-6 3 3 0 0 1 0 6z", kind: "line" },
      { d: "M8.6 16.6a3 3 0 1 1 0-6 3 3 0 0 1 0 6z", kind: "line" },
      { d: "M15.4 16.6a3 3 0 1 1 0-6 3 3 0 0 1 0 6z", kind: "line" },
      { d: "M12 14.2c0 2.6-.8 4.4-2 5.4h4c-1.2-1-2-2.8-2-5.4z", kind: "fill" },
    ],
  },

  /* Watching a table you are not seated at. */
  eye: {
    label: "Watching",
    paths: [
      { d: "M2.6 12S6.2 5.6 12 5.6 21.4 12 21.4 12 17.8 18.4 12 18.4 2.6 12 2.6 12z", kind: "line" },
      { d: "M12 14.8a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6z", kind: "accent" },
      { d: "M12 13.2a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4z", kind: "fill" },
    ],
  },

  /* Calotes: who owes whom, which is a ledger and has always been one. */
  ledger: {
    label: "Calotes",
    paths: [
      { d: "M6 3.6h11.5a1.6 1.6 0 0 1 1.6 1.6v13.6a1.6 1.6 0 0 1-1.6 1.6H6z", kind: "line" },
      { d: "M8.6 3.6v16.8", kind: "line" },
      { d: "M11 8.4h5.4", kind: "accent" },
      { d: "M11 12h5.4", kind: "accent" },
      { d: "M11 15.6h3.4", kind: "accent" },
    ],
  },

  stats: {
    label: "Stats",
    paths: [
      { d: "M4.4 19.6h15.2", kind: "line" },
      { d: "M8 19.6v-5.2", kind: "line" },
      { d: "M12 19.6v-9", kind: "line" },
      { d: "M16 19.6v-6.6", kind: "line" },
      { d: "M12 9.2a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z", kind: "fill" },
    ],
  },

  logout: {
    label: "Log out",
    paths: [
      { d: "M13.6 4.4H6.4a1.6 1.6 0 0 0-1.6 1.6v12a1.6 1.6 0 0 0 1.6 1.6h7.2", kind: "line" },
      { d: "M11.4 12h8.2", kind: "accent" },
      { d: "M16.6 8.8L19.8 12l-3.2 3.2", kind: "line" },
    ],
  },
};

/** Every name the set answers to. */
export const ICON_NAMES = Object.keys(GLYPHS);

/** One glyph, or null for a name nobody drew. */
export function glyph(name) {
  return GLYPHS[name] || null;
}
