import { useEffect, useState } from "react";

import { drips, hitFor, scatter } from "./hitEffects";

/**
 * Being hit, from the seat that was hit.
 *
 * Everybody at the table watches the thing cross and land on a seat. The player
 * it was aimed at sees something else: it landed on *them*, so it goes on their
 * screen — water runs down the glass, a tomato smears across it, a brick cracks
 * it, a bomb blanks it for a moment.
 *
 * Over the felt and under nothing that matters: it takes no clicks, it never
 * hides the board for more than an instant, and it is gone inside a second and
 * a half. A hand is being played underneath, and an effect that outstays that
 * has stopped being a joke.
 */
export default function HitEffect({ hit, onDone }) {
  const effect = hitFor(hit.item);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!effect) {
      onDone(hit.id);
      return undefined;
    }
    const timer = setTimeout(() => {
      setGone(true);
      onDone(hit.id);
    }, effect.ms);
    return () => clearTimeout(timer);
  }, [hit.id, effect, onDone]);

  if (!effect || gone) return null;

  const flecks = scatter(effect.flecks, hit.id);
  const runs = drips(effect.drips, hit.id);

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-40 overflow-hidden
                  ${effect.shake ? "animate-hit-shake" : ""}`}
      // Announced, because being hit is a thing that happened to you and a
      // screen reader has no way to see a splash.
      role="status"
      aria-label={`${hit.fromName || "Somebody"} hit you`}
    >
      {/* The wash: the colour of whatever landed, over everything, briefly. */}
      <div
        className="animate-hit-wash absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 45%, ${effect.tint} 0%, transparent 70%)`,
          // Through the variable rather than as `opacity`: the keyframe below
          // animates opacity, so setting it here would be overwritten and
          // every hit would peak at the same strength as every other.
          "--hit-wash": effect.wash,
          animationDuration: `${effect.ms}ms`,
        }}
      />

      {/* What ran down the glass. */}
      {runs.map((one, index) => (
        <span
          key={`drip-${index}`}
          className="animate-hit-drip absolute top-0 rounded-b-full"
          style={{
            left: `${one.left}%`,
            width: `${one.width}%`,
            height: `${one.run}%`,
            background: `linear-gradient(${effect.tint}, transparent)`,
            opacity: 0.5,
            animationDuration: `${effect.ms}ms`,
            animationDelay: `${one.delay}ms`,
          }}
        />
      ))}

      {/* And what stuck to it. The item's own splat, scattered. */}
      {flecks.map((one, index) => (
        <span
          key={`fleck-${index}`}
          className="animate-hit-fleck absolute leading-none"
          style={{
            left: `${one.left}%`,
            top: `${one.top}%`,
            fontSize: `${one.size}rem`,
            transform: `rotate(${one.spin}deg)`,
            animationDuration: `${effect.ms}ms`,
            animationDelay: `${one.delay}ms`,
          }}
        >
          {effect.glyph}
        </span>
      ))}
    </div>
  );
}
