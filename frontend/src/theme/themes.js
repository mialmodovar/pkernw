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

export const DEFAULT_THEME = {
  preset: DEFAULT_PRESET,
  accent: null,
  pattern: DEFAULT_PATTERN,
};

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
      "--color-accent-hover": "#a3283a",
      "--color-accent-soft": "rgba(138, 28, 43, 0.18)",
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
      "--color-accent-hover": "#2a8556",
      "--color-accent-soft": "rgba(30, 107, 69, 0.18)",
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
      "--color-accent-hover": "#3d5fa8",
      "--color-accent-soft": "rgba(47, 75, 138, 0.18)",
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

/** Toward white, so a chosen accent still has a lighter hover state. Mixing in
 *  sRGB is crude next to a proper colour space, but at 14% it is a nudge and
 *  nobody can tell the difference. */
const lighten = (hex, amount) => {
  const channels = toRgb(hex).map((c) => Math.round(c + (255 - c) * amount));
  return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
};

const withAlpha = (hex, alpha) => `rgba(${toRgb(hex).join(", ")}, ${alpha})`;

/** Drops anything we would not have written ourselves — an unknown preset from
 *  an older client, a malformed accent, or the empty object every profile
 *  carried before themes existed. Always returns something applyTheme can use. */
export function normalizeTheme(theme) {
  const preset = PRESETS[theme?.preset] ? theme.preset : DEFAULT_PRESET;
  const accent = isHexColour(theme?.accent) ? theme.accent.toLowerCase() : null;
  const pattern = PATTERNS[theme?.pattern] ? theme.pattern : DEFAULT_PATTERN;
  return { preset, accent, pattern };
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
  const tokens = {
    ...PRESETS[preset].tokens,
    "--card-back-bg": cardBackImage(preset, pattern),
  };
  if (!accent) return tokens;

  return {
    ...tokens,
    "--color-accent": accent,
    "--color-accent-hover": lighten(accent, 0.14),
    "--color-accent-soft": withAlpha(accent, 0.18),
    "--app-glow": withAlpha(accent, 0.18),
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
