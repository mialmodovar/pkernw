import { GLYPHS, VIEWBOX } from "./glyphs";

/**
 * One of the app's own icons.
 *
 * Two tones, which is what makes an engraving read as one: the shape in the
 * colour of whatever it sits in, and the ornament inside it a step back from
 * that. `tone="gold"` puts the highlight colour on the ornament instead, for
 * the few places where the icon is the point rather than the label's companion
 * — the coin, and the mode a lobby tab is showing.
 *
 * Titles are for icons that stand alone. An icon beside its own word is
 * decoration and is hidden from screen readers, which is why `label` has to be
 * asked for rather than taken from the glyph: only the caller knows whether the
 * word is already on the screen.
 */
export default function Icon({
  name,
  className = "w-4 h-4",
  tone = "mono",
  label = null,
  strokeWidth = 1.5,
}) {
  const found = GLYPHS[name];
  // A name nobody drew renders nothing rather than an empty box: a missing icon
  // should look like a missing icon, not like a broken one.
  if (!found) return null;

  const accentColor = tone === "gold" ? "var(--color-highlight-bright)" : "currentColor";
  const accentOpacity = tone === "gold" ? 1 : 0.55;

  return (
    <svg
      viewBox={VIEWBOX}
      className={`${className} shrink-0`}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : "true"}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {label && <title>{label}</title>}
      {found.paths.map((path, index) => {
        // A tilt belongs to the glyph, not to the renderer: two cards facing
        // each other are two rectangles and two angles, and writing the angles
        // into the path data would make them unreadable.
        const transform = path.transform || undefined;
        if (path.kind === "fill") {
          return (
            <path key={index} d={path.d} transform={transform}
              fill="currentColor" stroke="none" />
          );
        }
        if (path.kind === "accent") {
          return (
            <path
              key={index}
              d={path.d}
              transform={transform}
              stroke={accentColor}
              strokeOpacity={accentOpacity}
              strokeWidth={strokeWidth * 0.75}
            />
          );
        }
        return <path key={index} d={path.d} transform={transform} />;
      })}
    </svg>
  );
}
