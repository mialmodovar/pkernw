/** What a "theme" is here.
 *
 * Every skinnable surface in the app reads a CSS custom property — see the
 * :root and @theme blocks in index.css. A preset is nothing more than a map of
 * those properties to values, and applying one writes them onto <html>, where
 * an inline style outranks the stylesheet. No component subscribes to the
 * theme, re-renders, or even knows it exists; the browser repaints and that is
 * the whole mechanism.
 *
 * That is also the rule for extending this: to make something themeable, give
 * it a variable in index.css and a value in every preset below. A colour
 * written directly into a rule is a colour nobody can change.
 *
 * The preset *names* are mirrored in backend/accounts/serializers.py, which
 * refuses to store one it does not recognise. Adding a preset means adding it
 * in both places.
 */

export const DEFAULT_PRESET = "burgundy";
export const DEFAULT_PATTERN = "weave";

export const DEFAULT_DECK = "classic";

/**
 * How the front of a card is printed. `pattern` above is its back.
 *
 * "classic" is the four-colour deck this app has always dealt: ink on ivory.
 * "inverted" fills the card with the suit's own colour and prints the rank in
 * white — the suit is then readable from across the felt at seat size, where a
 * small red pip on cream is the thing people squint at. Matches
 * AVAILABLE_CARD_DECKS in accounts/serializers.py.
 */
export const DECKS = ["classic", "inverted"];

export const DEFAULT_THEME = {
  preset: DEFAULT_PRESET,
  accent: null,
  pattern: DEFAULT_PATTERN,
  deck: DEFAULT_DECK,
  // The GIF that plays in the middle of the table when you knock somebody out.
  // A Giphy id, never a URL — see api/giphy.js. Null is "no finisher", which is
  // what everyone starts with.
  finisherGifId: null,
  // The same thing, plural: up to three, each with a sound, and the table picks
  // one per knockout. The single id above is what a profile saved before this
  // existed still carries, and is folded into the list on the way in.
  finishers: [],
};

/** How many finishers a player may keep. Matches game/finishers.py. */
export const MAX_FINISHERS = 3;

/** The stings the table can play with a finisher. Matches sounds.js, and the
 *  server's list in game/finishers.py — a name, never a file. */
export const FINISHER_SOUNDS = ["none", "airhorn", "boom", "fanfare", "sting", "slam"];

/** Card-back patterns, as templates rather than finished artwork.
 *
 * Each one is built from the two colours the current preset gives its deck, so
 * every pattern works under every preset and the two settings stay independent
 * — pick a weave under Burgundy, keep the weave when you switch to Slate.
 *
 * All of them are pure repeating gradients on purpose: those tile from
 * background-image alone, with no background-size to carry, so a pattern stays
 * a single token. `ink` is the figure, `base` the ground.
 *
 * Mirrored by name in backend/accounts/serializers.py.
 */
export const PATTERNS = {
  weave: {
    label: "Weave",
    build: (base, ink) =>
      `repeating-linear-gradient(45deg, ${ink} 0 3px, ${base} 3px 6px)`,
  },
  crosshatch: {
    label: "Crosshatch",
    build: (base, ink) =>
      `repeating-linear-gradient(45deg, ${ink} 0 1.5px, transparent 1.5px 5px), ` +
      `repeating-linear-gradient(-45deg, ${ink} 0 1.5px, transparent 1.5px 5px), ` +
      `linear-gradient(${base}, ${base})`,
  },
  pinstripe: {
    label: "Pinstripe",
    build: (base, ink) =>
      `repeating-linear-gradient(90deg, ${ink} 0 2px, ${base} 2px 5px)`,
  },
  grid: {
    label: "Grid",
    build: (base, ink) =>
      `repeating-linear-gradient(0deg, ${ink} 0 1.5px, transparent 1.5px 6px), ` +
      `repeating-linear-gradient(90deg, ${ink} 0 1.5px, transparent 1.5px 6px), ` +
      `linear-gradient(${base}, ${base})`,
  },
  gradient: {
    label: "Gradient",
    build: (base, ink) => `linear-gradient(160deg, ${ink}, ${base})`,
  },
  solid: {
    label: "Solid",
    build: (base) => `linear-gradient(${base}, ${base})`,
  },
};

export const PATTERN_NAMES = Object.keys(PATTERNS);

export const PRESETS = {
  burgundy: {
    label: "Burgundy",
    cardBack: { base: "#4a1019", ink: "#5e1523" },
    tokens: {
      "--color-surface": "rgba(38, 24, 27, 0.85)",
      "--color-surface-raised": "rgba(56, 34, 38, 0.9)",
      "--color-accent": "#8a1c2b",
      "--color-border": "rgba(196, 178, 165, 0.2)",
      "--color-border-strong": "rgba(196, 178, 165, 0.38)",
      "--color-silver": "#c9c3bd",
      "--color-text-muted": "#9c9490",
      "--app-bg": "linear-gradient(180deg, #0c0708 0%, #0a0708 40%, #070506 100%)",
      "--app-glow": "rgba(120, 26, 36, 0.18)",
      "--felt-bg":
        "radial-gradient(ellipse 62% 62% at 50% 34%, rgba(134, 34, 47, 0.6), rgba(58, 16, 23, 0.92) 55%, rgba(12, 7, 9, 0.99) 100%), " +
        "linear-gradient(180deg, #2a1015, #120809)",
      "--card-back-edge": "rgba(214, 199, 190, 0.45)",
      "--card-back-pip": "rgba(224, 210, 200, 0.55)",
      "--panel-floating-bg": "#23161a",
    },
  },

  midnight: {
    label: "Midnight Green",
    cardBack: { base: "#0e3524", ink: "#14472f" },
    tokens: {
      "--color-surface": "rgba(24, 32, 28, 0.85)",
      "--color-surface-raised": "rgba(34, 46, 40, 0.9)",
      "--color-accent": "#1e6b45",
      "--color-border": "rgba(190, 202, 192, 0.2)",
      "--color-border-strong": "rgba(190, 202, 192, 0.38)",
      "--color-silver": "#c4ccc5",
      "--color-text-muted": "#94a09a",
      "--app-bg": "linear-gradient(180deg, #06090a 0%, #050809 40%, #040607 100%)",
      "--app-glow": "rgba(26, 120, 74, 0.16)",
      "--felt-bg":
        "radial-gradient(ellipse 62% 62% at 50% 34%, rgba(34, 120, 74, 0.58), rgba(14, 58, 36, 0.92) 55%, rgba(6, 14, 10, 0.99) 100%), " +
        "linear-gradient(180deg, #0e3122, #050f0a)",
      "--card-back-edge": "rgba(199, 214, 203, 0.45)",
      "--card-back-pip": "rgba(210, 224, 214, 0.55)",
      "--panel-floating-bg": "#14201a",
    },
  },

  slate: {
    label: "Slate Blue",
    cardBack: { base: "#1a2843", ink: "#233559" },
    tokens: {
      "--color-surface": "rgba(26, 30, 40, 0.85)",
      "--color-surface-raised": "rgba(38, 44, 58, 0.9)",
      "--color-accent": "#2f4b8a",
      "--color-border": "rgba(178, 188, 205, 0.2)",
      "--color-border-strong": "rgba(178, 188, 205, 0.38)",
      "--color-silver": "#c3c8d2",
      "--color-text-muted": "#939aa8",
      "--app-bg": "linear-gradient(180deg, #070910 0%, #06080e 40%, #04060a 100%)",
      "--app-glow": "rgba(48, 78, 140, 0.18)",
      "--felt-bg":
        "radial-gradient(ellipse 62% 62% at 50% 34%, rgba(58, 86, 148, 0.55), rgba(26, 40, 72, 0.92) 55%, rgba(7, 10, 18, 0.99) 100%), " +
        "linear-gradient(180deg, #16203a, #080b14)",
      "--card-back-edge": "rgba(195, 203, 218, 0.45)",
      "--card-back-pip": "rgba(208, 215, 228, 0.55)",
      "--panel-floating-bg": "#171b26",
    },
  },
};

export const PRESET_NAMES = Object.keys(PRESETS);

/** A handful of accents worth offering as one click. Anything else goes through
 *  the colour input next to them. */
export const ACCENT_SWATCHES = [
  "#8a1c2b", "#b4482c", "#8a6a1c", "#1e6b45",
  "#1c7d8a", "#2f4b8a", "#6b2f8a", "#8a2f5e",
];

const HEX = /^#[0-9a-fA-F]{6}$/;

export const isHexColour = (value) => typeof value === "string" && HEX.test(value);

const toRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (rgb) =>
  `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

const withAlpha = (hex, alpha) => `rgba(${toRgb(hex).join(", ")}, ${alpha})`;

const hslWithAlpha = (hsl, alpha) =>
  `rgba(${hslToRgb(hsl).map(Math.round).join(", ")}, ${alpha})`;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// --- HSL ------------------------------------------------------------------
// The accent's relatives are made by moving lightness and leaving hue alone.
// Mixing toward white in sRGB instead would work, but it washes the colour out
// as it lightens: a deep red would go pink rather than bright red, and the
// button gradient would lose the very thing that makes it read as one colour.

const rgbToHsl = ([r, g, b]) => {
  const [rd, gd, bd] = [r / 255, g / 255, b / 255];
  const max = Math.max(rd, gd, bd);
  const min = Math.min(rd, gd, bd);
  const delta = max - min;
  const l = (max + min) / 2;
  if (!delta) return [0, 0, l * 100];

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === rd) h = ((gd - bd) / delta) % 6;
  else if (max === gd) h = (bd - rd) / delta + 2;
  else h = (rd - gd) / delta + 4;
  return [((h * 60) + 360) % 360, s * 100, l * 100];
};

const hslToRgb = ([h, s, l]) => {
  const sd = s / 100;
  const ld = l / 100;
  const c = (1 - Math.abs(2 * ld - 1)) * sd;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ld - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] :
    h < 120 ? [x, c, 0] :
    h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] :
    h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
};

/** Move a colour by lightness points, optionally scaling saturation. */
const shift = (hex, { l = 0, s = 1 }) => {
  const [hue, sat, lum] = rgbToHsl(toRgb(hex));
  return toHex(hslToRgb([hue, clamp(sat * s, 0, 100), clamp(lum + l, 0, 100)]));
};

// --- Contrast -------------------------------------------------------------
// WCAG relative luminance. Needed because an accent is a free colour choice:
// white-on-burgundy reads fine, white-on-yellow does not, and nothing about
// the hex itself says which you picked.

const channelLuminance = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex) => {
  const [r, g, b] = toRgb(hex).map(channelLuminance);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const INK_LIGHT = "#f1e9e6";
const INK_DARK = "#14100f";

const AA_NORMAL = 4.5;

const worstContrast = (ink, stops) =>
  Math.min(...stops.map((stop) => contrastRatio(ink, stop)));

/** How far the whole gradient must move in lightness for `ink` to clear AA on
 *  every stop, walking in `direction` (-1 darker, +1 lighter). 0 if it already
 *  does. Always terminates: at either extreme one ink or the other is at
 *  maximum contrast. */
const offsetForInk = (stops, ink, direction) => {
  for (let step = 0; step <= 60; step += 1) {
    const moved = stops.map((stop) => shift(stop, { l: direction * step }));
    if (worstContrast(ink, moved) >= AA_NORMAL) return direction * step;
  }
  return direction * 60;
};

/** Pick the ink, and the lightness correction the accent needs to earn it.
 *
 * A button is a gradient, and the two inks fail at opposite ends of it: light
 * ink dies on the brightest stop, dark ink on the deepest. Mid-lightness
 * accents — teal, olive, mid green — fail *both*, sitting in a band where
 * neither white nor near-black reaches 4.5:1. No choice of text colour saves
 * those, so the button itself has to move.
 *
 * Rather than clamp each stop (which collapses the gradient to a flat slab),
 * the whole family shifts by one offset, keeping its shape and its hue and
 * changing only how dark it sits. Whichever ink demands the smaller move wins,
 * so the accent is distorted as little as the contrast requirement allows —
 * usually not at all. */
/** Ink for a gradient that cannot move.
 *
 * The accent gets inkPlan(), which is free to shift the whole button until an
 * ink fits. The highlight ladder is pinned — its lightnesses are what make gold
 * look like gold — so when neither soft ink clears AA, the ink escalates to
 * pure white or black instead of the surface moving. */
const inkForGradient = (stops) => {
  const light = worstContrast(INK_LIGHT, stops);
  const dark = worstContrast(INK_DARK, stops);
  if (light >= dark) return light >= AA_NORMAL ? INK_LIGHT : "#ffffff";
  return dark >= AA_NORMAL ? INK_DARK : "#000000";
};

const inkPlan = (stops) => {
  const darker = offsetForInk(stops, INK_LIGHT, -1);
  const lighter = offsetForInk(stops, INK_DARK, 1);
  return Math.abs(darker) <= Math.abs(lighter)
    ? { ink: INK_LIGHT, offset: darker }
    : { ink: INK_DARK, offset: lighter };
};

/** Raise lightness until the colour clears `target` contrast against `backdrop`.
 *
 * Accent-coloured text is the case a fixed palette cannot survive: a navy
 * accent that looks right on a button is invisible as a link on a dark panel.
 * Returns the lifted colour, or the lightest it could manage. */
const liftToContrast = (hex, backdrop, target) => {
  const [hue, sat, lum] = rgbToHsl(toRgb(hex));
  let out = hex;
  for (let step = 0; lum + step <= 94; step += 2) {
    out = toHex(hslToRgb([hue, sat, lum + step]));
    if (contrastRatio(out, backdrop) >= target) break;
  }
  return out;
};

/** The secondary colour — the gold, in the default theme.
 *
 * The table marks winners, the player on the clock, all-ins and blinds in gold,
 * and that only works because gold is *not* the accent: a highlight has to
 * contrast with the chrome around it or it stops reading as a highlight. So
 * this is a second hue rather than a shade of the first.
 *
 * +54 deg is not arbitrary — it is the rotation measured between the original
 * burgundy accent and the original gold, so the default theme keeps the exact
 * red-to-yellow relationship it always had, and every other accent inherits the
 * same relationship rather than a hardcoded yellow that clashes with it.
 *
 * Saturation and lightness are pinned per rung instead of following the accent,
 * which is the opposite of the hover wash: that had to stay mild, this has to
 * stay loud. A grey accent still gets a highlight you can see.
 */
const HIGHLIGHT_HUE_SHIFT = 54;

/** The ladder, written as the palette it has to reproduce.
 *
 * Each rung carries the original gold it replaces, and is matched to that
 * colour's *relative luminance* rather than its HSL lightness. That distinction
 * is the whole trick: hues are not equally bright, so holding lightness at 52%
 * while rotating the hue turns a luminous gold into a murky blue, and the rung
 * stops doing its job. Matching luminance instead keeps every rung as bright as
 * the gold it stands in for, whatever hue it lands on — a blue highlight simply
 * comes out paler to get there. */
const HIGHLIGHT_RUNGS = {
  "--color-highlight": { saturation: 67.5, like: "#c9a227" },
  "--color-highlight-bright": { saturation: 64.6, like: "#d4af37" },
  "--color-highlight-lift": { saturation: 72.4, like: "#e3c250" },
  "--color-highlight-deep": { saturation: 68.6, like: "#a17c1e" },
  "--color-highlight-deeper": { saturation: 70.4, like: "#8a6c18" },
  "--color-highlight-text": { saturation: 55.6, like: "#d9c07a" },
  "--color-highlight-pale": { saturation: 55.4, like: "#e6d9a8" },
  "--color-highlight-dim": { saturation: 69.4, like: "#3d2f0b" },
};

/** The colour at this hue and saturation whose luminance matches `target`.
 *  Luminance rises monotonically with lightness, so bisection converges. */
const atLuminance = (hue, saturation, target) => {
  let low = 0;
  let high = 100;
  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) / 2;
    if (luminance(toHex(hslToRgb([hue, saturation, mid]))) < target) low = mid;
    else high = mid;
  }
  return toHex(hslToRgb([hue, saturation, (low + high) / 2]));
};

const highlightFamily = (accentHue) => {
  const hue = (accentHue + HIGHLIGHT_HUE_SHIFT) % 360;
  const out = {};
  for (const [token, { saturation, like }] of Object.entries(HIGHLIGHT_RUNGS)) {
    out[token] = atLuminance(hue, saturation, luminance(like));
  }

  out["--color-highlight-edge"] = withAlpha(
    atLuminance(hue, 65.4, luminance("#e0c66b")),
    0.4,
  );
  // Bare channels, for the places that need the highlight at an alpha of their
  // own — the card glow pulses through five of them, so a fixed-alpha token
  // cannot serve it. Used as rgb(var(--highlight-rgb) / 0.55).
  out["--highlight-rgb"] = toRgb(out["--color-highlight-bright"]).join(" ");
  out["--color-highlight-ink"] = inkForGradient([
    out["--color-highlight-bright"],
    out["--color-highlight"],
    out["--color-highlight-deep"],
  ]);
  return out;
};

/** Everything downstream of one accent hex.
 *
 * Kept in one place so a preset's own accent and a custom one are treated
 * identically — the presets declare a single --color-accent and get the rest
 * from here, which is what stops the palette drifting apart as it grows.
 *
 * `backdrop` is the preset's opaque panel colour: the most demanding surface
 * accent text actually sits on, and lighter than the page behind it, so
 * clearing it clears both. */
const accentFamily = (accent, backdrop) => {
  // The gradient the accent wants, before any readability correction. Ordered
  // brightest to deepest; the two ends are what decide the ink.
  const wanted = [
    shift(accent, { l: 13, s: 0.86 }),
    shift(accent, { l: 7, s: 0.91 }),
    accent,
    shift(accent, { l: -15 }),
    shift(accent, { l: -10 }),
  ];

  const { ink, offset } = inkPlan(wanted.slice(0, 4));
  const [bright, hover, mid, deep, deepHover] = wanted.map((stop) => shift(stop, { l: offset }));

  // Links sit on a panel rather than on the accent, so they take the opposite
  // correction — lifted until they are readable rather than pushed under ink.
  const link = liftToContrast(shift(mid, { s: 0.78 }), backdrop, 7);

  // The wash under a hovered panel or secondary button. Only the hue is taken
  // from the accent; saturation and lightness are held at these mild fixed
  // values so the tint stays a hint rather than a second accent — a vivid
  // accent must not produce a vivid panel, and a grey one still has to give a
  // visible hover. The numbers are the burgundy midtone this replaced, read
  // back in HSL, so the default theme is unchanged.
  // Capped by the accent's own saturation, never just set to the mild value: a
  // grey accent has no hue at all (rgbToHsl reports 0, i.e. red), and tinting
  // by it would put a red wash back under every hovered button — the exact
  // thing this replaced.
  const [hue, accentSaturation] = rgbToHsl(toRgb(mid));
  const wash = (saturation, lightness, alpha) =>
    hslWithAlpha([hue, Math.min(saturation, accentSaturation), lightness], alpha);

  return {
    "--color-accent": mid,
    "--color-accent-hover": hover,
    "--color-accent-bright": bright,
    "--color-accent-deep": deep,
    "--color-accent-deep-hover": deepHover,
    "--color-accent-soft": withAlpha(mid, 0.18),
    "--app-glow": withAlpha(mid, 0.18),
    "--color-accent-text": ink,
    "--color-accent-link": link,
    "--color-accent-link-hover": shift(link, { l: 8 }),
    "--color-surface-hover": wash(23.3, 23.5, 0.95),
    "--color-surface-hover-deep": wash(21.2, 6.5, 0.7),
    // The bottom of a player plate — same wash family, near black.
    "--color-surface-sunken": wash(23, 5.1, 0.95),
    ...highlightFamily(hue),
  };
};

/** Drops anything we would not have written ourselves — an unknown preset from
 *  an older client, a malformed accent, or the empty object every profile
 *  carried before themes existed. Always returns something applyTheme can use. */
// Giphy ids are short and alphanumeric. Anything else did not come from the
// picker, so it is dropped rather than passed on — the same rule the server
// applies in game/giphy.py.
const GIF_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function normalizeTheme(theme) {
  const preset = PRESETS[theme?.preset] ? theme.preset : DEFAULT_PRESET;
  const accent = isHexColour(theme?.accent) ? theme.accent.toLowerCase() : null;
  const pattern = PATTERNS[theme?.pattern] ? theme.pattern : DEFAULT_PATTERN;
  const deck = DECKS.includes(theme?.deck) ? theme.deck : DEFAULT_DECK;
  // The server speaks snake_case and the client camelCase; this is the one
  // place the two names meet, so both spellings are accepted on the way in.
  const rawGif = theme?.finisherGifId ?? theme?.finisher_gif_id ?? null;
  const finisherGifId = GIF_ID.test(String(rawGif || "")) ? String(rawGif) : null;
  return { preset, accent, pattern, deck, finisherGifId, finishers: normalizeFinishers(theme) };
}

/**
 * The finisher list, from whichever shape it arrived in.
 *
 * Both spellings again, and the single id folded in when there is no list —
 * a player who chose a finisher before this existed keeps it, and the next
 * time they change anything it is saved back in the new shape.
 */
export function normalizeFinishers(theme) {
  const raw = theme?.finishers;
  const list = Array.isArray(raw) ? raw : [];
  const cleaned = [];
  const seen = new Set();
  for (const entry of list) {
    const item = typeof entry === "string" ? { gifId: entry } : (entry || {});
    const gifId = String(item.gifId ?? item.gif_id ?? "");
    if (!GIF_ID.test(gifId) || seen.has(gifId)) continue;
    seen.add(gifId);
    cleaned.push({ gifId, sound: FINISHER_SOUNDS.includes(item.sound) ? item.sound : "none" });
    if (cleaned.length >= MAX_FINISHERS) break;
  }
  if (cleaned.length) return cleaned;
  const legacy = theme?.finisherGifId ?? theme?.finisher_gif_id ?? null;
  return GIF_ID.test(String(legacy || "")) ? [{ gifId: String(legacy), sound: "none" }] : [];
}

/** The card back a preset/pattern pair produces. Exported so the settings panel
 *  can draw a swatch of each option in the colours actually in play. */
export function cardBackImage(preset, pattern) {
  const { base, ink } = (PRESETS[preset] || PRESETS[DEFAULT_PRESET]).cardBack;
  return (PATTERNS[pattern] || PATTERNS[DEFAULT_PATTERN]).build(base, ink);
}

/** The preset's tokens, with the accent family swapped out if one is set.
 *
 * A custom accent moves the chrome — buttons, focus rings, the glow behind the
 * page — and deliberately leaves the felt and the deck to the preset. Tinting
 * a nine-stop felt gradient from one hex reliably produces mud, and the felt is
 * the largest surface on screen to get wrong. */
export function resolveTokens(theme) {
  const { preset, accent, pattern } = normalizeTheme(theme);
  const base = PRESETS[preset].tokens;

  return {
    ...base,
    "--card-back-bg": cardBackImage(preset, pattern),
    // A custom accent is not a special case: the preset's own accent goes
    // through exactly the same derivation, so the two cannot look different in
    // kind, only in hue.
    ...accentFamily(accent || base["--color-accent"], base["--panel-floating-bg"]),
  };
}

/** The accent a theme is actually painting with, for the UI to show as selected. */
export function effectiveAccent(theme) {
  const { preset, accent } = normalizeTheme(theme);
  return accent || PRESETS[preset].tokens["--color-accent"];
}

export function applyTheme(theme) {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(resolveTokens(theme))) {
    root.style.setProperty(name, value);
  }
}
