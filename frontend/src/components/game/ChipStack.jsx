import { chipLean, chipMetrics, chipsFor } from "./chips";

/**
 * A leaning stack of chips, seen from slightly above.
 *
 * Decorative — the exact figure is always printed alongside, since a stack of
 * six can only ever approximate an amount.
 *
 * Each chip is one element doing three jobs: the face is a radial gradient so
 * it reads as a disc rather than a sticker, the rim is a conic-gradient with
 * breaks in it (the spots on a real chip, and a cue that survives greyscale),
 * and a hard box-shadow below it is the chip's own side, which is what makes a
 * stack look like objects instead of a column of rings.
 */
export default function ChipStack({ amount, size = 12 }) {
  if (!amount || amount <= 0) return null;

  const chips = chipsFor(amount);
  const { rim, edge, overlap } = chipMetrics(size);
  const leans = chips.map((_, index) => chipLean(index, size));
  const sideways = Math.max(...leans.map(Math.abs), 0);

  return (
    <span
      className="relative inline-block shrink-0"
      style={{
        width: size + sideways * 2,
        height: size + edge + overlap * (chips.length - 1),
      }}
      aria-hidden="true"
    >
      {chips.map((chip, index) => (
        <span
          key={index}
          className="absolute rounded-full"
          style={{
            width: size,
            height: size,
            left: sideways + leans[index],
            bottom: index * overlap,
            // The rim, with its spots: a ring of trim broken by the face colour
            // at regular intervals. Painted as one background so a chip is one
            // element however small it is drawn.
            // `closest-side` matters: a circle gradient sizes itself to the
            // farthest corner by default, so 100% would be the corner of the
            // box rather than the edge of the chip and every rim would come
            // out half again too thick.
            background: `
              radial-gradient(circle closest-side at 50% 34%,
                rgba(255,255,255,0.3), rgba(255,255,255,0) 100%),
              radial-gradient(circle closest-side at 50% 50%,
                ${chip.face} 0 calc(100% - ${rim}px),
                transparent calc(100% - ${rim}px)),
              repeating-conic-gradient(from 0deg,
                ${chip.trim} 0deg ${180 / chip.spots}deg,
                ${chip.face} ${180 / chip.spots}deg ${360 / chip.spots}deg)
            `,
            // The side of the chip, and its shadow on whatever is beneath it.
            boxShadow: `
              0 ${edge}px 0 ${chip.edge},
              0 ${edge + 1}px ${Math.max(2, edge)}px rgba(0,0,0,0.55),
              inset 0 0 0 0.5px rgba(0,0,0,0.35)
            `,
          }}
        />
      ))}
    </span>
  );
}
