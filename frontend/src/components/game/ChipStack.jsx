// Casino-style denominations, largest first. Each chip in the stack is drawn
// from the biggest denomination that still fits, so the colours read as an
// amount at a glance rather than being decorative.
const DENOMINATIONS = [
  { value: 5000, ring: "#c9c3bd", face: "linear-gradient(145deg,#4a4a52,#232329)" }, // silver
  { value: 1000, ring: "#e0c66b", face: "linear-gradient(145deg,#7a5f16,#3d2f0b)" }, // gold
  { value: 500,  ring: "#8f7ab8", face: "linear-gradient(145deg,#4b3a6b,#241b34)" }, // purple
  { value: 100,  ring: "#5b5b64", face: "linear-gradient(145deg,#2c2c33,#141418)" }, // black
  { value: 25,   ring: "#4f8f6d", face: "linear-gradient(145deg,#27543f,#12261d)" }, // green
  { value: 5,    ring: "#c3565f", face: "linear-gradient(145deg,#7a2129,#3a1014)" }, // red
  { value: 1,    ring: "#b9b0a7", face: "linear-gradient(145deg,#5a544d,#2b2724)" }, // white
];

const MAX_CHIPS = 6;

function chipsFor(amount) {
  const chips = [];
  let left = amount;
  for (const denom of DENOMINATIONS) {
    while (left >= denom.value && chips.length < MAX_CHIPS) {
      chips.push(denom);
      left -= denom.value;
    }
    if (chips.length >= MAX_CHIPS) break;
  }
  // Never render nothing for a live amount.
  if (!chips.length && amount > 0) chips.push(DENOMINATIONS[DENOMINATIONS.length - 1]);
  return chips;
}

/**
 * A small leaning stack of chips. Decorative — the exact figure is always
 * printed alongside it, since a stack can only ever approximate the amount.
 */
export default function ChipStack({ amount, size = 12 }) {
  if (!amount || amount <= 0) return null;
  const chips = chipsFor(amount);
  const overlap = Math.round(size * 0.28);

  return (
    <span
      className="relative inline-block shrink-0"
      style={{ width: size, height: size + overlap * (chips.length - 1) }}
      aria-hidden="true"
    >
      {chips.map((chip, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            width: size,
            height: size,
            bottom: i * overlap,
            background: chip.face,
            border: `1.5px solid ${chip.ring}`,
            boxShadow: "0 1px 2px rgba(0,0,0,0.6)",
          }}
        />
      ))}
    </span>
  );
}
